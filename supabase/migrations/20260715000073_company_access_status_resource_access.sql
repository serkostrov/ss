-- Per-status cabinet capabilities (what companies with this status can see and use).

create table if not exists public.company_access_status_resource_access (
  status_slug text not null
    references public.company_access_statuses (slug) on delete cascade,
  resource public.cabinet_resource not null,
  allows_visibility boolean not null default false,
  allows_content boolean not null default false,
  primary key (status_slug, resource),
  constraint company_access_status_resource_access_content_implies_visibility
    check (not allows_content or allows_visibility)
);

comment on table public.company_access_status_resource_access is
  'Глобальные возможности статуса компании в кабинете: видимость раздела и доступ к содержимому.';

insert into public.company_access_status_resource_access (
  status_slug,
  resource,
  allows_visibility,
  allows_content
)
select
  cas.slug,
  r.resource,
  case
    when cas.excludes_from_program then false
    else true
  end,
  case
    when cas.excludes_from_program then false
    when cas.is_default then true
    else false
  end
from public.company_access_statuses cas
cross join (
  values
    ('directory'::public.cabinet_resource),
    ('products'::public.cabinet_resource),
    ('materials'::public.cabinet_resource),
    ('polls'::public.cabinet_resource),
    ('work_groups'::public.cabinet_resource),
    ('invoices'::public.cabinet_resource)
) as r(resource)
on conflict (status_slug, resource) do nothing;

create or replace function public.seed_company_access_status_resource_access(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.company_access_statuses;
begin
  select * into v_row
  from public.company_access_statuses
  where slug = p_slug;

  if not found then
    return;
  end if;

  insert into public.company_access_status_resource_access (
    status_slug,
    resource,
    allows_visibility,
    allows_content
  )
  select
    p_slug,
    r.resource,
    not v_row.excludes_from_program,
    not v_row.excludes_from_program and v_row.is_default
  from (
    values
      ('directory'::public.cabinet_resource),
      ('products'::public.cabinet_resource),
      ('materials'::public.cabinet_resource),
      ('polls'::public.cabinet_resource),
      ('work_groups'::public.cabinet_resource),
      ('invoices'::public.cabinet_resource)
  ) as r(resource)
  on conflict (status_slug, resource) do nothing;
end;
$$;

create or replace function public.trg_seed_company_access_status_resource_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_company_access_status_resource_access(new.slug);
  return new;
end;
$$;

drop trigger if exists company_access_statuses_seed_resource_access on public.company_access_statuses;
create trigger company_access_statuses_seed_resource_access
after insert on public.company_access_statuses
for each row
execute function public.trg_seed_company_access_status_resource_access();

create or replace function public.get_company_access_status_resource_access(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'resource', sra.resource,
        'allows_visibility', sra.allows_visibility,
        'allows_content', sra.allows_content
      )
      order by sra.resource
    ),
    '[]'::jsonb
  )
  from public.company_access_status_resource_access sra
  where sra.status_slug = p_slug;
$$;

create or replace function public.set_company_access_status_resource_access(
  p_slug text,
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
  v_visibility boolean;
  v_content boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.company_access_statuses where slug = p_slug
  ) then
    raise exception 'status_not_found' using errcode = 'P0002';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_resource := (v_row->>'resource')::public.cabinet_resource;
    v_visibility := coalesce((v_row->>'allows_visibility')::boolean, false);
    v_content := coalesce((v_row->>'allows_content')::boolean, false);

    if v_content and not v_visibility then
      raise exception 'content_requires_visibility' using errcode = 'P0001';
    end if;

    insert into public.company_access_status_resource_access (
      status_slug,
      resource,
      allows_visibility,
      allows_content
    )
    values (p_slug, v_resource, v_visibility, v_content)
    on conflict (status_slug, resource) do update
    set
      allows_visibility = excluded.allows_visibility,
      allows_content = excluded.allows_content;
  end loop;

  return public.get_company_access_status_resource_access(p_slug);
end;
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
        select
          case
            when p_kind = 'visibility' then sra.allows_visibility
            when p_kind = 'content' then sra.allows_content
            else false
          end
          and case
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
        join public.company_access_status_resource_access sra
          on sra.status_slug = c.access_status
         and sra.resource = p_resource
        where u.id = auth.uid()
          and u.representative_id is not null
          and (
            (u.role = 'member' and u.status = 'confirmed')
            or (u.role = 'admin' and u.status is distinct from 'blocked')
          )
      ),
      (
        select case
          when p_kind = 'visibility' then sra.allows_visibility
          when p_kind = 'content' then sra.allows_content
          else false
        end
        from public.company_access_status_resource_access sra
        where sra.status_slug = public.current_company_access_status()
          and sra.resource = p_resource
      )
      and case
        when p_kind = 'visibility' then
          not public.company_access_status_excludes_program(public.current_company_access_status())
        when p_kind = 'content' then
          public.current_company_access_status() = public.default_company_access_status_slug()
        else false
      end
    );
$$;

alter table public.company_access_status_resource_access enable row level security;

drop policy if exists company_access_status_resource_access_admin_all
  on public.company_access_status_resource_access;
create policy company_access_status_resource_access_admin_all
on public.company_access_status_resource_access for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.company_access_status_resource_access to authenticated;
grant all on public.company_access_status_resource_access to service_role;

revoke all on function public.get_company_access_status_resource_access(text) from public;
grant execute on function public.get_company_access_status_resource_access(text)
  to authenticated, service_role;

revoke all on function public.set_company_access_status_resource_access(text, jsonb) from public;
grant execute on function public.set_company_access_status_resource_access(text, jsonb)
  to authenticated, service_role;

revoke all on function public.seed_company_access_status_resource_access(text) from public;
grant execute on function public.seed_company_access_status_resource_access(text)
  to authenticated, service_role;
