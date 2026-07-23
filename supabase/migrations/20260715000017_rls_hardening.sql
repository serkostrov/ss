-- =============================================================================
-- RLS hardening: helpers, full policy set, Storage, RPC grants, settings, PII
-- =============================================================================
-- This migration is IDEMPOTENT: DROP POLICY / CREATE OR REPLACE throughout.
-- Detailed policy catalogue: see supabase/RLS_POLICIES.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- 1) settings (typed in app, previously missing)
-- -----------------------------------------------------------------------------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

alter table public.settings enable row level security;
alter table public.settings force row level security;

-- -----------------------------------------------------------------------------
-- 2) Shared helpers (SECURITY DEFINER, locked search_path)
-- -----------------------------------------------------------------------------

-- Active administrator (role=admin AND status=confirmed).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.status = 'confirmed'
  );
$$;

-- Confirmed association member with linked representative.
create or replace function public.is_confirmed_member()
returns boolean
language sql
stable
security definer
set search_path = public
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

-- Published materials visible to company level ACL.
create or replace function public.member_can_access_material_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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

-- Active in-window poll with matching company participation level.
create or replace function public.member_can_access_poll(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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

-- Lock down helper EXECUTE: revoke PUBLIC, grant authenticated (and service_role via supabase).
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

-- -----------------------------------------------------------------------------
-- 3) Force RLS on all application tables (table owner cannot bypass)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users',
    'companies',
    'representatives',
    'participation_levels',
    'material_sections',
    'material_section_levels',
    'material_documents',
    'work_groups',
    'work_group_members',
    'work_group_links',
    'messenger_connections',
    'polls',
    'poll_options',
    'poll_level_access',
    'poll_votes',
    'messages',
    'message_relays',
    'audit_log',
    'settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- =============================================================================
-- 4) USERS (PII) — own row read; admin full update; no direct insert/delete
-- =============================================================================
drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin
on public.users for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists users_update_admin on public.users;
create policy users_update_admin
on public.users for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists users_no_direct_insert on public.users;
create policy users_no_direct_insert
on public.users for insert to authenticated
with check (false);

drop policy if exists users_no_direct_delete on public.users;
create policy users_no_direct_delete
on public.users for delete to authenticated
using (false);

-- =============================================================================
-- 5) COMPANIES (PII) — admin ALL; confirmed member: own company only
-- =============================================================================
drop policy if exists companies_admin_all on public.companies;
create policy companies_admin_all
on public.companies for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_select_confirmed_member on public.companies;
create policy companies_select_confirmed_member
on public.companies for select to authenticated
using (
  public.is_admin()
  or (
    public.is_confirmed_member()
    and id = public.current_company_id()
  )
);

-- =============================================================================
-- 6) REPRESENTATIVES (PII) — admin ALL; member: linked row only
-- =============================================================================
drop policy if exists representatives_admin_all on public.representatives;
create policy representatives_admin_all
on public.representatives for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Linked representative only (pending or confirmed). No peer company PII.
drop policy if exists representatives_select_own on public.representatives;
drop policy if exists representatives_select_linked_pending on public.representatives;
create policy representatives_select_own
on public.representatives for select to authenticated
using (
  public.is_admin()
  or id = public.current_representative_id()
);

-- =============================================================================
-- 7) PARTICIPATION LEVELS — members: active only; admin: all + write
-- =============================================================================
drop policy if exists participation_levels_select on public.participation_levels;
drop policy if exists participation_levels_admin_write on public.participation_levels;
drop policy if exists participation_levels_admin_all on public.participation_levels;
drop policy if exists participation_levels_member_read_active on public.participation_levels;

create policy participation_levels_admin_all
on public.participation_levels for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy participation_levels_member_read_active
on public.participation_levels for select to authenticated
using (
  public.is_admin()
  or (public.is_confirmed_member() and is_active = true)
);

-- =============================================================================
-- 8) MATERIALS — company level ACL via member_can_access_material_section
-- =============================================================================
drop policy if exists material_sections_admin_all on public.material_sections;
create policy material_sections_admin_all
on public.material_sections for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_sections_member_read on public.material_sections;
create policy material_sections_member_read
on public.material_sections for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_material_section(id)
);

drop policy if exists material_section_levels_admin_all on public.material_section_levels;
create policy material_section_levels_admin_all
on public.material_section_levels for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_section_levels_member_read on public.material_section_levels;
create policy material_section_levels_member_read
on public.material_section_levels for select to authenticated
using (
  public.is_admin()
  or (
    public.member_can_access_material_section(material_section_id)
    and participation_level_id = public.current_company_level_id()
  )
);

drop policy if exists material_documents_admin_all on public.material_documents;
create policy material_documents_admin_all
on public.material_documents for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_documents_member_read on public.material_documents;
create policy material_documents_member_read
on public.material_documents for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_material_section(material_section_id)
);

-- =============================================================================
-- 9) WORK GROUPS
-- =============================================================================
drop policy if exists work_groups_admin_all on public.work_groups;
create policy work_groups_admin_all
on public.work_groups for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_groups_member_read on public.work_groups;
create policy work_groups_member_read
on public.work_groups for select to authenticated
using (
  public.is_admin()
  or (
    public.member_belongs_to_work_group(id)
    and status <> 'archived'
  )
);

drop policy if exists work_group_members_admin_all on public.work_group_members;
create policy work_group_members_admin_all
on public.work_group_members for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_group_members_member_read on public.work_group_members;
create policy work_group_members_member_read
on public.work_group_members for select to authenticated
using (
  public.is_admin()
  or (
    public.is_confirmed_member()
    and representative_id = public.current_representative_id()
  )
);

drop policy if exists work_group_links_admin_all on public.work_group_links;
create policy work_group_links_admin_all
on public.work_group_links for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_group_links_member_read on public.work_group_links;
create policy work_group_links_member_read
on public.work_group_links for select to authenticated
using (
  public.is_admin()
  or public.member_belongs_to_work_group(work_group_id)
);

drop policy if exists messenger_connections_admin_all on public.messenger_connections;
create policy messenger_connections_admin_all
on public.messenger_connections for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Members see connection status for their groups (chat_id is operational binding).
drop policy if exists messenger_connections_member_read on public.messenger_connections;
create policy messenger_connections_member_read
on public.messenger_connections for select to authenticated
using (
  public.is_admin()
  or public.member_belongs_to_work_group(work_group_id)
);

-- =============================================================================
-- 10) POLLS + votes (no direct write to poll_votes)
-- =============================================================================
drop policy if exists polls_admin_all on public.polls;
create policy polls_admin_all
on public.polls for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists polls_member_read on public.polls;
create policy polls_member_read
on public.polls for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_poll(id)
);

drop policy if exists poll_options_admin_all on public.poll_options;
create policy poll_options_admin_all
on public.poll_options for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists poll_options_member_read on public.poll_options;
create policy poll_options_member_read
on public.poll_options for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_poll(poll_id)
);

drop policy if exists poll_level_access_admin_all on public.poll_level_access;
create policy poll_level_access_admin_all
on public.poll_level_access for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Hardened: only rows for polls the member can actually open (not any active poll).
drop policy if exists poll_level_access_member_read on public.poll_level_access;
create policy poll_level_access_member_read
on public.poll_level_access for select to authenticated
using (
  public.is_admin()
  or (
    public.member_can_access_poll(poll_id)
    and participation_level_id = public.current_company_level_id()
  )
);

drop policy if exists poll_votes_admin_read on public.poll_votes;
create policy poll_votes_admin_read
on public.poll_votes for select to authenticated
using (public.is_admin());

drop policy if exists poll_votes_member_read_own on public.poll_votes;
create policy poll_votes_member_read_own
on public.poll_votes for select to authenticated
using (
  public.is_admin()
  or (
    public.is_confirmed_member()
    and public.member_can_access_poll(poll_id)
    and (
      representative_id = public.current_representative_id()
      or (
        company_id = public.current_company_id()
        and exists (
          select 1 from public.polls p
          where p.id = poll_votes.poll_id
            and p.vote_mode = 'per_company'
        )
      )
    )
  )
);

-- Direct client writes forbidden — only cast_vote (SECURITY DEFINER) inserts.
drop policy if exists poll_votes_no_direct_write on public.poll_votes;
create policy poll_votes_no_direct_write
on public.poll_votes for insert to authenticated
with check (false);

drop policy if exists poll_votes_no_update on public.poll_votes;
create policy poll_votes_no_update
on public.poll_votes for update to authenticated
using (false)
with check (false);

drop policy if exists poll_votes_no_delete on public.poll_votes;
create policy poll_votes_no_delete
on public.poll_votes for delete to authenticated
using (false);

-- =============================================================================
-- 11) MESSAGES (group members read; writes via service role / admin)
-- =============================================================================
drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all
on public.messages for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists messages_member_read on public.messages;
create policy messages_member_read
on public.messages for select to authenticated
using (
  public.is_admin()
  or public.member_belongs_to_work_group(work_group_id)
);

drop policy if exists messages_no_member_insert on public.messages;
create policy messages_no_member_insert
on public.messages for insert to authenticated
with check (public.is_admin());

drop policy if exists message_relays_admin_all on public.message_relays;
create policy message_relays_admin_all
on public.message_relays for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists message_relays_member_read on public.message_relays;
create policy message_relays_member_read
on public.message_relays for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.messages m
    where m.id = message_relays.message_id
      and public.member_belongs_to_work_group(m.work_group_id)
  )
);

-- =============================================================================
-- 12) AUDIT LOG — admin read; no direct write
-- =============================================================================
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select
on public.audit_log for select to authenticated
using (public.is_admin());

drop policy if exists audit_log_no_direct_insert on public.audit_log;
create policy audit_log_no_direct_insert
on public.audit_log for insert to authenticated
with check (false);

drop policy if exists audit_log_no_update on public.audit_log;
create policy audit_log_no_update
on public.audit_log for update to authenticated
using (false)
with check (false);

drop policy if exists audit_log_no_delete on public.audit_log;
create policy audit_log_no_delete
on public.audit_log for delete to authenticated
using (false);

-- =============================================================================
-- 13) SETTINGS — admin only
-- =============================================================================
drop policy if exists settings_admin_all on public.settings;
create policy settings_admin_all
on public.settings for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =============================================================================
-- 14) STORAGE — material-documents + work-group-files
-- =============================================================================

-- material-documents: admin CRUD
drop policy if exists material_documents_storage_admin_all on storage.objects;
create policy material_documents_storage_admin_all
on storage.objects for all to authenticated
using (bucket_id = 'material-documents' and public.is_admin())
with check (bucket_id = 'material-documents' and public.is_admin());

-- material-documents: member read if ACL + matching file_url row
drop policy if exists material_documents_storage_member_read on storage.objects;
create policy material_documents_storage_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'material-documents'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.material_documents d
      where d.file_url = name
        and public.member_can_access_material_section(d.material_section_id)
    )
  )
);

-- Member INSERT/UPDATE/DELETE: no policies → denied (only admin ALL above).

-- work-group-files: admin CRUD
drop policy if exists work_group_files_admin_all on storage.objects;
create policy work_group_files_admin_all
on storage.objects for all to authenticated
using (bucket_id = 'work-group-files' and public.is_admin())
with check (bucket_id = 'work-group-files' and public.is_admin());

drop policy if exists work_group_files_member_read on storage.objects;
create policy work_group_files_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'work-group-files'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.work_group_links l
      where l.file_url = name
        and public.member_belongs_to_work_group(l.work_group_id)
    )
  )
);

-- Drop mistaken permissive insert policies if applied from earlier drafts.
drop policy if exists material_documents_storage_no_member_insert on storage.objects;
drop policy if exists work_group_files_storage_no_member_insert on storage.objects;

-- Ensure buckets stay private
update storage.buckets
set public = false
where id in ('material-documents', 'work-group-files');

-- =============================================================================
-- 15) RPC: harden grants (revoke PUBLIC, grant authenticated + service_role)
-- =============================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.proname in (
        'confirm_registration',
        'reject_registration',
        'set_user_status',
        'get_participation_level_usage',
        'delete_participation_level',
        'reorder_participation_levels',
        'set_primary_representative',
        'upsert_representative',
        'reorder_material_sections',
        'set_material_section_levels',
        'reorder_material_documents',
        'bulk_set_material_section_levels',
        'bulk_add_work_group_members',
        'reorder_work_group_links',
        'set_poll_levels',
        'replace_poll_options',
        'cast_vote',
        'get_poll_results',
        'list_poll_votes_admin',
        'write_audit_log'
      )
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Keep search_path locked on cast_vote / write_audit_log (reaffirm).
alter function public.cast_vote(uuid, uuid) set search_path = public;
alter function public.write_audit_log(text, text, text, jsonb) set search_path = public;
