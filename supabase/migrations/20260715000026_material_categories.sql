-- Material categories (справочник) + FK on material_sections.

create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint material_categories_name_unique unique (name),
  constraint material_categories_slug_unique unique (slug)
);

create index if not exists material_categories_sort_idx
  on public.material_categories (sort_order, name);

insert into public.material_categories (name, slug, sort_order)
values
  ('Письма МПТ', 'pisma-mpt', 10),
  ('Договоры', 'dogovory', 20),
  ('Методички', 'metodichki', 30),
  ('Прочее', 'prochee', 100)
on conflict (slug) do nothing;

alter table public.material_sections
  add column if not exists category_id uuid
    references public.material_categories (id) on delete set null;

create index if not exists material_sections_category_id_idx
  on public.material_sections (category_id);

alter table public.material_categories enable row level security;

drop policy if exists material_categories_admin_all on public.material_categories;
create policy material_categories_admin_all
on public.material_categories for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_categories_select_authenticated on public.material_categories;
create policy material_categories_select_authenticated
on public.material_categories for select to authenticated
using (public.is_admin() or is_active is true);

grant select, insert, update, delete on public.material_categories to authenticated;

-- Usage / safe delete / reorder

create or replace function public.get_material_category_usage(p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sections integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_sections
  from public.material_sections
  where category_id = p_category_id;

  return jsonb_build_object(
    'material_sections', v_sections,
    'total', v_sections
  );
end;
$$;

create or replace function public.delete_material_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage jsonb;
  v_total integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.material_categories where id = p_category_id) then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  v_usage := public.get_material_category_usage(p_category_id);
  v_total := coalesce((v_usage->>'total')::integer, 0);

  if v_total > 0 then
    raise exception 'category_in_use:%', v_usage::text using errcode = 'P0001';
  end if;

  delete from public.material_categories where id = p_category_id;
end;
$$;

create or replace function public.reorder_material_categories(p_ordered_ids uuid[])
returns setof public.material_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.material_categories
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.material_categories
    order by sort_order asc, name asc;
end;
$$;

revoke all on function public.get_material_category_usage(uuid) from public;
revoke all on function public.delete_material_category(uuid) from public;
revoke all on function public.reorder_material_categories(uuid[]) from public;

grant execute on function public.get_material_category_usage(uuid) to authenticated, service_role;
grant execute on function public.delete_material_category(uuid) to authenticated, service_role;
grant execute on function public.reorder_material_categories(uuid[]) to authenticated, service_role;
