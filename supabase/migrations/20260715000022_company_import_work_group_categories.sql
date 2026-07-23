-- Company import support (unique INN) + work group categories (directions).

-- =============================================================================
-- 1) Companies: unique INN for upsert from Excel
-- =============================================================================

create unique index if not exists companies_inn_unique_idx
  on public.companies (inn)
  where inn is not null and btrim(inn) <> '';

-- =============================================================================
-- 2) Work group categories (directions)
-- =============================================================================

create table if not exists public.work_group_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint work_group_categories_name_unique unique (name),
  constraint work_group_categories_slug_unique unique (slug)
);

create index if not exists work_group_categories_sort_idx
  on public.work_group_categories (sort_order, name);

insert into public.work_group_categories (name, slug, sort_order)
values
  ('Технические', 'technical', 10),
  ('Мероприятия', 'events', 20),
  ('Правление', 'board', 30),
  ('Прочее', 'other', 100)
on conflict (slug) do nothing;

alter table public.work_groups
  add column if not exists category_id uuid references public.work_group_categories (id) on delete set null;

create index if not exists work_groups_category_id_idx
  on public.work_groups (category_id);

-- Default existing groups to «Прочее» if unset
update public.work_groups wg
set category_id = c.id
from public.work_group_categories c
where wg.category_id is null
  and c.slug = 'other';

alter table public.work_group_categories enable row level security;

drop policy if exists work_group_categories_admin_all on public.work_group_categories;
create policy work_group_categories_admin_all
on public.work_group_categories for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_group_categories_select_authenticated on public.work_group_categories;
create policy work_group_categories_select_authenticated
on public.work_group_categories for select to authenticated
using (public.is_admin() or is_active is true);

grant select, insert, update, delete on public.work_group_categories to authenticated;

-- =============================================================================
-- 3) Admin bulk upsert companies from Excel (by INN)
-- =============================================================================

create or replace function public.import_companies(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row jsonb;
  v_inn text;
  v_name text;
  v_status public.company_access_status;
  v_level_name text;
  v_level_id uuid;
  v_existing_id uuid;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_idx int := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array' using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    begin
      v_name := nullif(trim(coalesce(v_row->>'name', '')), '');
      v_inn := nullif(regexp_replace(coalesce(v_row->>'inn', ''), '\D', '', 'g'), '');
      v_level_name := nullif(trim(coalesce(v_row->>'participation_level', '')), '');

      if v_name is null then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_idx,
          'error', 'empty_name',
          'message', 'Пустое название'
        ));
        continue;
      end if;

      if v_inn is not null and v_inn !~ '^\d{10}(\d{2})?$' then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_idx,
          'error', 'invalid_inn',
          'message', 'Некорректный ИНН',
          'inn', v_inn
        ));
        continue;
      end if;

      v_status := case lower(trim(coalesce(v_row->>'access_status', 'active')))
        when 'active' then 'active'::public.company_access_status
        when 'активна' then 'active'::public.company_access_status
        when 'активный' then 'active'::public.company_access_status
        when 'suspended' then 'suspended'::public.company_access_status
        when 'приостановлена' then 'suspended'::public.company_access_status
        when 'приостановлен' then 'suspended'::public.company_access_status
        when 'archived' then 'archived'::public.company_access_status
        when 'архив' then 'archived'::public.company_access_status
        when 'вышла' then 'archived'::public.company_access_status
        when 'вышедшая' then 'archived'::public.company_access_status
        when 'вышедшие' then 'archived'::public.company_access_status
        when 'exited' then 'archived'::public.company_access_status
        else 'active'::public.company_access_status
      end;

      v_level_id := null;
      if v_level_name is not null then
        select pl.id into v_level_id
        from public.participation_levels pl
        where lower(pl.name) = lower(v_level_name)
        limit 1;
      end if;

      v_existing_id := null;
      if v_inn is not null then
        select c.id into v_existing_id
        from public.companies c
        where c.inn = v_inn
        limit 1;
      end if;

      if v_existing_id is null then
        insert into public.companies (
          name,
          inn,
          description,
          phone,
          email,
          website,
          address,
          participation_level_id,
          access_status,
          notes
        )
        values (
          v_name,
          v_inn,
          nullif(trim(coalesce(v_row->>'description', '')), ''),
          nullif(trim(coalesce(v_row->>'phone', '')), ''),
          nullif(lower(trim(coalesce(v_row->>'email', ''))), ''),
          nullif(trim(coalesce(v_row->>'website', '')), ''),
          nullif(trim(coalesce(v_row->>'address', '')), ''),
          v_level_id,
          v_status,
          nullif(trim(coalesce(v_row->>'notes', '')), '')
        );
        v_created := v_created + 1;
      else
        update public.companies
        set
          name = v_name,
          description = coalesce(nullif(trim(coalesce(v_row->>'description', '')), ''), description),
          phone = coalesce(nullif(trim(coalesce(v_row->>'phone', '')), ''), phone),
          email = coalesce(nullif(lower(trim(coalesce(v_row->>'email', ''))), ''), email),
          website = coalesce(nullif(trim(coalesce(v_row->>'website', '')), ''), website),
          address = coalesce(nullif(trim(coalesce(v_row->>'address', '')), ''), address),
          participation_level_id = coalesce(v_level_id, participation_level_id),
          access_status = v_status,
          notes = coalesce(nullif(trim(coalesce(v_row->>'notes', '')), ''), notes),
          updated_at = now()
        where id = v_existing_id;
        v_updated := v_updated + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_idx,
        'error', SQLSTATE,
        'message', SQLERRM
      ));
    end;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.import_companies(jsonb) from public;
grant execute on function public.import_companies(jsonb) to authenticated, service_role;
