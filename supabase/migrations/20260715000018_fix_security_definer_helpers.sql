-- =============================================================================
-- Fix SECURITY DEFINER helpers under FORCE ROW LEVEL SECURITY
-- =============================================================================
-- Symptom: INSERT/UPDATE fail with
--   "new row violates row-level security policy for table \"…\""
-- on admin tables (participation_levels, companies, polls, …).
--
-- Root causes:
--   1) FORCE RLS applies even to SECURITY DEFINER owners. Helpers reading
--      public.users hit policies that call is_admin() again → recursion /
--      empty result → is_admin() returns false → WITH CHECK fails.
--   2) is_admin() required status='confirmed', while the SPA treats any
--      role=admin as admin access (bootstrap admins with pending blocked).
--
-- Fix: SET row_security = off on helpers; is_admin = role admin, not blocked.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.status is distinct from 'blocked'
  );
$$;

create or replace function public.is_confirmed_member()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
      and u.representative_id is not null
  );
$$;

create or replace function public.current_representative_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.representative_id
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select r.company_id
  from public.users u
  join public.representatives r on r.id = u.representative_id
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_company_level_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.participation_level_id
  from public.users u
  join public.representatives r on r.id = u.representative_id
  join public.companies c on c.id = r.company_id
  where u.id = auth.uid()
    and u.role = 'member'
    and u.status = 'confirmed'
    and c.access_status = 'active'
  limit 1;
$$;

create or replace function public.member_belongs_to_work_group(p_work_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.users u
    join public.work_group_members wgm
      on wgm.representative_id = u.representative_id
     and wgm.work_group_id = p_work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  );
$$;

create or replace function public.member_can_access_material_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.material_sections s
    join public.material_section_levels msl on msl.material_section_id = s.id
    join public.users u on u.id = auth.uid()
    join public.representatives r on r.id = u.representative_id
    join public.companies c on c.id = r.company_id
    where s.id = p_section_id
      and s.is_published = true
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
      and c.participation_level_id is not null
      and msl.participation_level_id = c.participation_level_id
  );
$$;

create or replace function public.member_can_access_poll(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.polls p
    join public.poll_level_access pla on pla.poll_id = p.id
    join public.users u on u.id = auth.uid()
    join public.representatives r on r.id = u.representative_id
    join public.companies c on c.id = r.company_id
    where p.id = p_poll_id
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
      and c.participation_level_id is not null
      and pla.participation_level_id = c.participation_level_id
  );
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'is_admin()',
    'is_confirmed_member()',
    'current_representative_id()',
    'current_company_id()',
    'current_company_level_id()',
    'member_belongs_to_work_group(uuid)',
    'member_can_access_material_section(uuid)',
    'member_can_access_poll(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- Idempotent table grants so admin CRUD is not blocked by privilege gaps.
grant select, insert, update, delete on table
  public.participation_levels,
  public.companies,
  public.representatives,
  public.material_sections,
  public.material_section_levels,
  public.material_documents,
  public.work_groups,
  public.work_group_members,
  public.work_group_links,
  public.messenger_connections,
  public.polls,
  public.poll_options,
  public.poll_level_access,
  public.poll_votes,
  public.messages,
  public.message_relays,
  public.audit_log,
  public.settings
to authenticated;

grant select, update on table public.users to authenticated;
