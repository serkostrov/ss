-- Configurable company access statuses (replace fixed enum).

create table if not exists public.company_access_statuses (
  slug text primary key,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_default boolean not null default false,
  excludes_from_program boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_access_statuses_slug_format
    check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint company_access_statuses_name_not_empty
    check (char_length(btrim(name)) > 0)
);

create unique index if not exists company_access_statuses_single_default_idx
  on public.company_access_statuses (is_default)
  where is_default is true;

comment on table public.company_access_statuses is
  'Справочник статусов доступа компании (активна, приостановлена, вышедшая и др.).';

insert into public.company_access_statuses (
  slug, name, description, sort_order, is_active, is_system, is_default, excludes_from_program
)
values
  (
    'active',
    'Активна',
    'Полный доступ к программе ассоциации по правилам уровня участия.',
    0,
    true,
    true,
    true,
    false
  ),
  (
    'suspended',
    'Приостановлена',
    'Компания в программе, но доступ к содержимому может быть ограничен.',
    1,
    true,
    true,
    false,
    false
  ),
  (
    'archived',
    'Вышедшая',
    'Компания вышла из ассоциации; участие в рабочих группах недоступно.',
    2,
    true,
    true,
    false,
    true
  )
on conflict (slug) do nothing;

alter table public.companies
  alter column access_status drop default;

do $migrate$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute att
    join pg_catalog.pg_class rel on rel.oid = att.attrelid
    join pg_catalog.pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_catalog.pg_type typ on typ.oid = att.atttypid
    where nsp.nspname = 'public'
      and rel.relname = 'companies'
      and att.attname = 'access_status'
      and att.attnum > 0
      and not att.attisdropped
      and typ.typname = 'company_access_status'
  ) then
    alter table public.companies
      alter column access_status type text using access_status::text;
  end if;
end;
$migrate$;

alter table public.companies
  drop constraint if exists companies_access_status_fkey;

alter table public.companies
  add constraint companies_access_status_fkey
  foreign key (access_status) references public.company_access_statuses (slug);

alter table public.companies
  alter column access_status set default 'active';

do $migrate$
begin
  if exists (
    select 1
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = '_company_access_status'
  ) then
    alter table public.participation_level_resource_access
      alter column visibility_statuses type text[] using visibility_statuses::text[];

    alter table public.participation_level_resource_access
      alter column content_statuses type text[] using content_statuses::text[];
  end if;
end;
$migrate$;

-- RLS policies depend on member_cabinet_resource_allowed — replace in place, do not drop.
create or replace function public.member_cabinet_resource_allowed(
  p_resource public.cabinet_resource,
  p_kind text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.is_confirmed_member()
    and coalesce(
      (
        select case
          when p_kind = 'visibility' then
            c.access_status = any(plra.visibility_statuses)
          when p_kind = 'content' then
            c.access_status = any(plra.content_statuses)
          else false
        end
        from public.users u
        join public.representatives r on r.id = u.representative_id
        join public.companies c on c.id = r.company_id
        join public.participation_level_resource_access plra
          on plra.participation_level_id = c.participation_level_id
         and plra.resource = p_resource
        where u.id = auth.uid()
          and u.representative_id is not null
          and (
            (u.role = 'member' and u.status = 'confirmed')
            or (u.role = 'admin' and u.status is distinct from 'blocked')
          )
      ),
      (
        select case
          when p_kind = 'visibility' then
            c.access_status in ('active', 'suspended')
          when p_kind = 'content' then
            c.access_status = 'active'
          else false
        end
        from public.users u
        join public.representatives r on r.id = u.representative_id
        join public.companies c on c.id = r.company_id
        where u.id = auth.uid()
          and u.representative_id is not null
          and (
            (u.role = 'member' and u.status = 'confirmed')
            or (u.role = 'admin' and u.status is distinct from 'blocked')
          )
        limit 1
      )
    );
$$;

-- Remaining enum-dependent functions can be dropped before the type.
drop trigger if exists participation_levels_seed_resource_access on public.participation_levels;
drop function if exists public.current_company_access_status();
drop function if exists public.set_participation_level_resource_access(uuid, jsonb);
drop function if exists public.trg_seed_level_resource_access();
drop function if exists public.import_companies(jsonb);
drop function if exists public.request_work_group_membership(
  uuid,
  public.work_group_membership_request_kind
);

drop type if exists public.company_access_status;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.default_company_access_status_slug()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select cas.slug
  from public.company_access_statuses cas
  where cas.is_default
  order by cas.sort_order, cas.slug
  limit 1;
$$;

create or replace function public.company_access_status_excludes_program(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (
      select cas.excludes_from_program
      from public.company_access_statuses cas
      where cas.slug = p_slug
    ),
    false
  );
$$;

create or replace function public.level_resource_access_visibility_defaults()
returns text[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    array_agg(cas.slug order by cas.sort_order, cas.slug),
    array['active', 'suspended']::text[]
  )
  from public.company_access_statuses cas
  where cas.is_active
    and not cas.excludes_from_program;
$$;

create or replace function public.level_resource_access_content_defaults()
returns text[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    array_agg(cas.slug order by cas.sort_order, cas.slug),
    array[public.default_company_access_status_slug()]
  )
  from public.company_access_statuses cas
  where cas.is_active
    and cas.is_default;
$$;

create or replace function public.validate_company_access_status_slug(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.company_access_statuses cas
    where cas.slug = p_slug
      and cas.is_active
  );
$$;

create or replace function public.validate_company_access_status_slug_array(p_slugs text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p_slugs is not null
    and cardinality(p_slugs) >= 1
    and not exists (
      select 1
      from unnest(p_slugs) as slug
      where not public.validate_company_access_status_slug(slug)
    );
$$;

create or replace function public.current_company_access_status()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.access_status
  from public.users u
  join public.representatives r on r.id = u.representative_id
  join public.companies c on c.id = r.company_id
  where u.id = auth.uid()
    and u.representative_id is not null
    and (
      (u.role = 'member' and u.status = 'confirmed')
      or (u.role = 'admin' and u.status is distinct from 'blocked')
    )
  limit 1;
$$;

create or replace function public.member_cabinet_resource_allowed(
  p_resource public.cabinet_resource,
  p_kind text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.is_confirmed_member()
    and coalesce(
      (
        select case
          when p_kind = 'visibility' then
            public.current_company_access_status() = any(plra.visibility_statuses)
          when p_kind = 'content' then
            public.current_company_access_status() = any(plra.content_statuses)
          else false
        end
        from public.users u
        join public.representatives r on r.id = u.representative_id
        join public.companies c on c.id = r.company_id
        join public.participation_level_resource_access plra
          on plra.participation_level_id = c.participation_level_id
         and plra.resource = p_resource
        where u.id = auth.uid()
          and u.representative_id is not null
          and (
            (u.role = 'member' and u.status = 'confirmed')
            or (u.role = 'admin' and u.status is distinct from 'blocked')
          )
      ),
      case
        when p_kind = 'visibility' then
          not public.company_access_status_excludes_program(public.current_company_access_status())
        when p_kind = 'content' then
          public.current_company_access_status() = public.default_company_access_status_slug()
        else false
      end
    );
$$;

create or replace function public.trg_seed_level_resource_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.participation_level_resource_access (
    participation_level_id,
    resource,
    visibility_statuses,
    content_statuses
  )
  select
    new.id,
    r.resource,
    public.level_resource_access_visibility_defaults(),
    public.level_resource_access_content_defaults()
  from (
    values
      ('directory'::public.cabinet_resource),
      ('products'::public.cabinet_resource),
      ('materials'::public.cabinet_resource),
      ('polls'::public.cabinet_resource),
      ('work_groups'::public.cabinet_resource),
      ('invoices'::public.cabinet_resource)
  ) as r(resource)
  on conflict (participation_level_id, resource) do nothing;

  return new;
end;
$$;

drop trigger if exists participation_levels_seed_resource_access on public.participation_levels;
create trigger participation_levels_seed_resource_access
after insert on public.participation_levels
for each row
execute function public.trg_seed_level_resource_access();

create or replace function public.set_participation_level_resource_access(
  p_level_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row jsonb;
  v_resource public.cabinet_resource;
  v_visibility text[];
  v_content text[];
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.participation_levels where id = p_level_id) then
    raise exception 'level_not_found' using errcode = 'P0002';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_resource := (v_row->>'resource')::public.cabinet_resource;
    v_visibility := array(
      select jsonb_array_elements_text(v_row->'visibility_statuses')
    );
    v_content := array(
      select jsonb_array_elements_text(v_row->'content_statuses')
    );

    if not public.validate_company_access_status_slug_array(v_visibility)
       or not public.validate_company_access_status_slug_array(v_content) then
      raise exception 'invalid_access_status' using errcode = 'P0001';
    end if;

    insert into public.participation_level_resource_access (
      participation_level_id,
      resource,
      visibility_statuses,
      content_statuses
    )
    values (p_level_id, v_resource, v_visibility, v_content)
    on conflict (participation_level_id, resource) do update
    set
      visibility_statuses = excluded.visibility_statuses,
      content_statuses = excluded.content_statuses;
  end loop;

  return public.get_participation_level_resource_access(p_level_id);
end;
$$;

create or replace function public.get_company_access_status_usage(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_companies int;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::int into v_companies
  from public.companies c
  where c.access_status = p_slug;

  return jsonb_build_object('companies', v_companies);
end;
$$;

create or replace function public.delete_company_access_status(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row public.company_access_statuses;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_row
  from public.company_access_statuses
  where slug = p_slug
  for update;

  if not found then
    raise exception 'status_not_found' using errcode = 'P0002';
  end if;

  if v_row.is_system then
    raise exception 'system_status_protected' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.companies c where c.access_status = p_slug) then
    raise exception 'status_in_use' using errcode = 'P0001';
  end if;

  update public.participation_level_resource_access plra
  set
    visibility_statuses = array_remove(plra.visibility_statuses, p_slug),
    content_statuses = array_remove(plra.content_statuses, p_slug)
  where p_slug = any(plra.visibility_statuses)
     or p_slug = any(plra.content_statuses);

  delete from public.company_access_statuses where slug = p_slug;
end;
$$;

create or replace function public.request_work_group_membership(
  p_work_group_id uuid,
  p_kind public.work_group_membership_request_kind
)
returns public.work_group_membership_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep_id uuid;
  v_company_id uuid;
  v_group public.work_groups;
  v_is_member boolean;
  v_request public.work_group_membership_requests;
  v_company_status text;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_rep_id := public.current_representative_id();
  v_company_id := public.current_company_id();

  if v_rep_id is null or v_company_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.access_status into v_company_status
  from public.companies c
  where c.id = v_company_id;

  if public.company_access_status_excludes_program(v_company_status) then
    raise exception 'company_exited' using errcode = '42501';
  end if;

  select * into v_group
  from public.work_groups wg
  where wg.id = p_work_group_id
  for update;

  if not found then
    raise exception 'work_group_not_found' using errcode = 'P0002';
  end if;

  if v_group.status = 'archived'::public.work_group_status then
    raise exception 'work_group_archived' using errcode = 'P0001';
  end if;

  v_is_member := exists (
    select 1
    from public.work_group_members wgm
    where wgm.work_group_id = p_work_group_id
      and wgm.representative_id = v_rep_id
  );

  if p_kind = 'join'::public.work_group_membership_request_kind and v_is_member then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  if p_kind = 'leave'::public.work_group_membership_request_kind and not v_is_member then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.work_group_membership_requests r
    where r.work_group_id = p_work_group_id
      and r.representative_id = v_rep_id
      and r.status = 'pending'::public.work_group_membership_request_status
  ) then
    raise exception 'request_already_pending' using errcode = 'P0001';
  end if;

  insert into public.work_group_membership_requests (
    work_group_id,
    representative_id,
    company_id,
    requested_by,
    kind
  )
  values (
    p_work_group_id,
    v_rep_id,
    v_company_id,
    auth.uid(),
    p_kind
  )
  returning * into v_request;

  return v_request;
end;
$$;

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
  v_status text;
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
        when 'active' then 'active'
        when 'активна' then 'active'
        when 'активный' then 'active'
        when 'suspended' then 'suspended'
        when 'приостановлена' then 'suspended'
        when 'приостановлен' then 'suspended'
        when 'archived' then 'archived'
        when 'архив' then 'archived'
        when 'вышла' then 'archived'
        when 'вышедшая' then 'archived'
        when 'вышедшие' then 'archived'
        when 'exited' then 'archived'
        else 'active'
      end;

      if not public.validate_company_access_status_slug(v_status) then
        v_status := public.default_company_access_status_slug();
      end if;

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

alter table public.company_access_statuses enable row level security;

drop policy if exists company_access_statuses_admin_all on public.company_access_statuses;
create policy company_access_statuses_admin_all
on public.company_access_statuses for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.company_access_statuses to authenticated;
grant all on public.company_access_statuses to service_role;

revoke all on function public.default_company_access_status_slug() from public;
grant execute on function public.default_company_access_status_slug() to authenticated, service_role;

revoke all on function public.company_access_status_excludes_program(text) from public;
grant execute on function public.company_access_status_excludes_program(text) to authenticated, service_role;

revoke all on function public.get_company_access_status_usage(text) from public;
grant execute on function public.get_company_access_status_usage(text) to authenticated, service_role;

revoke all on function public.delete_company_access_status(text) from public;
grant execute on function public.delete_company_access_status(text) to authenticated, service_role;

revoke all on function public.validate_company_access_status_slug(text) from public;
grant execute on function public.validate_company_access_status_slug(text) to authenticated, service_role;

revoke all on function public.validate_company_access_status_slug_array(text[]) from public;
grant execute on function public.validate_company_access_status_slug_array(text[]) to authenticated, service_role;

revoke all on function public.current_company_access_status() from public;
grant execute on function public.current_company_access_status() to authenticated, service_role;

revoke all on function public.member_cabinet_resource_allowed(public.cabinet_resource, text) from public;
grant execute on function public.member_cabinet_resource_allowed(public.cabinet_resource, text) to authenticated, service_role;

revoke all on function public.set_participation_level_resource_access(uuid, jsonb) from public;
grant execute on function public.set_participation_level_resource_access(uuid, jsonb) to authenticated, service_role;

revoke all on function public.import_companies(jsonb) from public;
grant execute on function public.import_companies(jsonb) to authenticated, service_role;

revoke all on function public.request_work_group_membership(
  uuid,
  public.work_group_membership_request_kind
) from public;
grant execute on function public.request_work_group_membership(
  uuid,
  public.work_group_membership_request_kind
) to authenticated;
