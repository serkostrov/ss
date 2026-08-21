-- =============================================================================
-- Combined schema: all 75 historical migrations, in original order.
-- Source files (do not lose statements):
--   01. 20260715000001_registration_core.sql
--   02. 20260715000002_registration_rpcs.sql
--   03. 20260715000003_participation_levels.sql
--   04. 20260715000004_representatives.sql
--   05. 20260715000005_materials.sql
--   06. 20260715000006_material_documents_storage.sql
--   07. 20260715000007_bulk_material_section_levels.sql
--   08. 20260715000008_cabinet_material_rls.sql
--   09. 20260715000009_work_groups.sql
--   10. 20260715000010_work_group_members_bulk.sql
--   11. 20260715000011_work_group_links.sql
--   12. 20260715000012_polls.sql
--   13. 20260715000013_member_poll_voting.sql
--   14. 20260715000014_poll_results.sql
--   15. 20260715000015_messages.sql
--   16. 20260715000016_audit_log.sql
--   17. 20260715000017_rls_hardening.sql
--   18. 20260715000018_fix_security_definer_helpers.sql
--   19. 20260715000019_fix_poll_rpcs.sql
--   20. 20260715000020_company_inn_hint.sql
--   21. 20260715000021_cabinet_directory_staff.sql
--   22. 20260715000022_company_import_work_group_categories.sql
--   23. 20260715000023_assign_member_to_company.sql
--   24. 20260715000024_work_group_category_admin_rpcs.sql
--   25. 20260715000025_show_contacts_to_members.sql
--   26. 20260715000026_material_categories.sql
--   27. 20260715000027_company_products.sql
--   28. 20260715000028_messenger_username.sql
--   29. 20260715000029_telegram_max_usernames.sql
--   30. 20260715000030_messenger_bot_channels.sql
--   31. 20260715000031_messenger_chat_kind_private.sql
--   32. 20260715000032_messenger_connections_multi_chat.sql
--   33. 20260715000033_messenger_connections_one_per_platform.sql
--   34. 20260715000034_messages_realtime.sql
--   35. 20260715000035_company_auto_id_balance_comments.sql
--   36. 20260715000036_company_auto_id_six_digits.sql
--   37. 20260715000037_company_auto_id_random.sql
--   38. 20260715000038_member_self_profile.sql
--   39. 20260715000039_product_categories.sql
--   40. 20260715000040_product_moderation.sql
--   41. 20260715000041_material_moderation.sql
--   42. 20260715000042_invoices.sql
--   43. 20260715000043_invoices_fields.sql
--   44. 20260715000044_notifications.sql
--   45. 20260715000045_mark_notifications_by_types.sql
--   46. 20260715000046_email_notifications.sql
--   47. 20260715000047_fix_product_category_suggestion_status_cast.sql
--   48. 20260715000048_okpd2_and_product_notes.sql
--   49. 20260715000049_okpd2_seed_without_staging.sql
--   50. 20260715000050_product_okpd_note_proposals.sql
--   51. 20260715000051_admin_notifications.sql
--   52. 20260715000052_registration_confirmed_notification.sql
--   53. 20260715000053_fix_max_chat_id_zero.sql
--   54. 20260715000054_demote_from_staff.sql
--   55. 20260715000055_staff_company_context.sql
--   56. 20260715000056_cabinet_work_groups.sql
--   57. 20260715000057_work_group_membership_requests.sql
--   58. 20260715000058_staff_company_position.sql
--   59. 20260715000059_admin_own_profile.sql
--   60. 20260715000060_demote_reuse_representative.sql
--   61. 20260715000061_unlink_representative_from_user.sql
--   62. 20260715000062_remove_representative_from_company.sql
--   63. 20260715000063_message_relay_dedup.sql
--   64. 20260715000064_fix_moderation_pending_notifications.sql
--   65. 20260715000065_work_group_responsible_links.sql
--   66. 20260715000066_participation_level_resource_access.sql
--   67. 20260715000067_cabinet_work_groups_filters.sql
--   68. 20260715000068_admin_user_management.sql
--   69. 20260715000069_assign_candidates_include_staff.sql
--   70. 20260715000070_demote_staff_without_company.sql
--   71. 20260715000071_registration_position_hint.sql
--   72. 20260715000072_company_access_statuses.sql
--   73. 20260715000073_company_access_status_resource_access.sql
--   74. 20260715000074_level_resource_access_optional_statuses.sql
--   75. 20260819000075_password_reset_tokens.sql
--
-- Enum CREATE TYPE statements include later ADD VALUE members so this file
-- can run as a single transaction (PostgreSQL cannot use a newly added enum
-- value until the transaction that added it commits).
-- ALTER TYPE ADD VALUE IF NOT EXISTS statements are kept and become no-ops.
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000001_registration_core.sql
-- =============================================================================

-- Core schema for registration workflow (ТЗ §4 subset).
-- Enums, companies, representatives, users, auth sync trigger.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_status as enum ('pending', 'confirmed', 'blocked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.company_access_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null;
end $$;

create table if not exists public.participation_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  inn text,
  description text,
  phone text,
  email text,
  website text,
  address text,
  participation_level_id uuid references public.participation_levels (id) on delete set null,
  access_status public.company_access_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.representatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  position text,
  phone text,
  email text,
  pd_consent boolean not null default false,
  pd_consent_date timestamptz,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'member',
  representative_id uuid unique references public.representatives (id) on delete set null,
  status public.user_status not null default 'pending',
  full_name text,
  phone text,
  company_name_hint text,
  pd_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists users_status_idx on public.users (status);
create index if not exists users_email_idx on public.users (email);
create index if not exists representatives_company_id_idx on public.representatives (company_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists representatives_set_updated_at on public.representatives;
create trigger representatives_set_updated_at
before update on public.representatives
for each row execute function public.set_updated_at();

-- Sync auth.users → public.users on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    pd_consent_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.representatives enable row level security;
alter table public.participation_levels enable row level security;

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
  );
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin
on public.users for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists users_update_admin on public.users;
create policy users_update_admin
on public.users for update to authenticated
using (public.is_admin())
with check (public.is_admin());

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
  or exists (
    select 1
    from public.users u
    join public.representatives r on r.id = u.representative_id
    where u.id = auth.uid()
      and u.status = 'confirmed'
      and r.company_id = companies.id
  )
);

drop policy if exists representatives_admin_all on public.representatives;
create policy representatives_admin_all
on public.representatives for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists representatives_select_own on public.representatives;
create policy representatives_select_own
on public.representatives for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.representative_id = representatives.id
  )
);

drop policy if exists participation_levels_select on public.participation_levels;
create policy participation_levels_select
on public.participation_levels for select to authenticated
using (true);

drop policy if exists participation_levels_admin_write on public.participation_levels;
create policy participation_levels_admin_write
on public.participation_levels for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =============================================================================
-- END 20260715000001_registration_core.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000002_registration_rpcs.sql
-- =============================================================================

-- Atomic registration RPCs (single transaction per call).

create or replace function public.confirm_registration(
  p_user_id uuid,
  p_representative_id uuid default null,
  p_create_representative jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_rep_id uuid;
  v_company_id uuid;
  v_existing_link uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' and v_user.representative_id is not null then
    raise exception 'use_set_user_status_to_unblock' using errcode = 'P0001';
  end if;

  if p_representative_id is not null and p_create_representative is not null then
    raise exception 'provide_either_existing_or_create' using errcode = 'P0001';
  end if;

  if p_representative_id is null and p_create_representative is null then
    raise exception 'representative_required' using errcode = 'P0001';
  end if;

  if p_representative_id is not null then
    if not exists (select 1 from public.representatives r where r.id = p_representative_id and r.is_active) then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;

    select u.id into v_existing_link
    from public.users u
    where u.representative_id = p_representative_id
      and u.id <> p_user_id
    limit 1;

    if v_existing_link is not null then
      raise exception 'representative_already_linked' using errcode = 'P0001';
    end if;

    v_rep_id := p_representative_id;
  else
    -- Create company if needed, then representative
    if p_create_representative ? 'company_id'
       and nullif(p_create_representative->>'company_id', '') is not null then
      v_company_id := (p_create_representative->>'company_id')::uuid;
      if not exists (select 1 from public.companies c where c.id = v_company_id) then
        raise exception 'company_not_found' using errcode = 'P0002';
      end if;
    else
      if nullif(p_create_representative->>'company_name', '') is null then
        raise exception 'company_required' using errcode = 'P0001';
      end if;

      insert into public.companies (name, access_status)
      values (trim(p_create_representative->>'company_name'), 'active')
      returning id into v_company_id;
    end if;

    if nullif(p_create_representative->>'full_name', '') is null then
      raise exception 'representative_full_name_required' using errcode = 'P0001';
    end if;

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      v_company_id,
      trim(p_create_representative->>'full_name'),
      nullif(trim(p_create_representative->>'position'), ''),
      nullif(trim(p_create_representative->>'phone'), ''),
      nullif(lower(trim(p_create_representative->>'email')), ''),
      coalesce((p_create_representative->>'pd_consent')::boolean, true),
      case
        when coalesce((p_create_representative->>'pd_consent')::boolean, true)
          then coalesce(v_user.pd_consent_at, now())
        else null
      end,
      coalesce((p_create_representative->>'is_primary')::boolean, true),
      true
    )
    returning id into v_rep_id;
  end if;

  update public.users
  set
    status = 'confirmed',
    representative_id = v_rep_id,
    full_name = coalesce(nullif(trim(full_name), ''), (
      select r.full_name from public.representatives r where r.id = v_rep_id
    ))
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

create or replace function public.reject_registration(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_rejected' using errcode = 'P0001';
  end if;

  if v_user.status <> 'pending' then
    raise exception 'only_pending_can_be_rejected' using errcode = 'P0001';
  end if;

  update public.users
  set status = 'blocked'
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

create or replace function public.set_user_status(
  p_user_id uuid,
  p_status public.user_status
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status not in ('confirmed', 'blocked') then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_supported' using errcode = 'P0001';
  end if;

  if p_status = 'confirmed' then
    if v_user.representative_id is null then
      raise exception 'representative_required_for_confirm' using errcode = 'P0001';
    end if;
    if v_user.status = 'pending' then
      raise exception 'use_confirm_registration_for_pending' using errcode = 'P0001';
    end if;
  end if;

  update public.users
  set status = p_status
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

grant execute on function public.confirm_registration(uuid, uuid, jsonb) to authenticated;
grant execute on function public.reject_registration(uuid) to authenticated;
grant execute on function public.set_user_status(uuid, public.user_status) to authenticated;

-- =============================================================================
-- END 20260715000002_registration_rpcs.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000003_participation_levels.sql
-- =============================================================================

-- Participation levels: protect delete when in use; atomic delete & reorder RPCs.

-- Companies must not silently lose level on delete
alter table public.companies
  drop constraint if exists companies_participation_level_id_fkey;

alter table public.companies
  add constraint companies_participation_level_id_fkey
  foreign key (participation_level_id)
  references public.participation_levels (id)
  on delete restrict;

create or replace function public.get_participation_level_usage(p_level_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companies integer := 0;
  v_material_sections integer := 0;
  v_polls integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_companies
  from public.companies
  where participation_level_id = p_level_id;

  if to_regclass('public.material_section_levels') is not null then
    execute
      'select count(*)::integer from public.material_section_levels where participation_level_id = $1'
      into v_material_sections
      using p_level_id;
  end if;

  if to_regclass('public.poll_level_access') is not null then
    execute
      'select count(*)::integer from public.poll_level_access where participation_level_id = $1'
      into v_polls
      using p_level_id;
  end if;

  return jsonb_build_object(
    'companies', v_companies,
    'material_sections', v_material_sections,
    'polls', v_polls,
    'total', v_companies + v_material_sections + v_polls
  );
end;
$$;

create or replace function public.delete_participation_level(p_level_id uuid)
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

  if not exists (select 1 from public.participation_levels where id = p_level_id) then
    raise exception 'level_not_found' using errcode = 'P0002';
  end if;

  v_usage := public.get_participation_level_usage(p_level_id);
  v_total := coalesce((v_usage->>'total')::integer, 0);

  if v_total > 0 then
    raise exception 'level_in_use:%', v_usage::text using errcode = 'P0001';
  end if;

  delete from public.participation_levels where id = p_level_id;
end;
$$;

create or replace function public.reorder_participation_levels(p_ordered_ids uuid[])
returns setof public.participation_levels
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
    update public.participation_levels
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'level_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.participation_levels
    order by sort_order asc, name asc;
end;
$$;

grant execute on function public.get_participation_level_usage(uuid) to authenticated;
grant execute on function public.delete_participation_level(uuid) to authenticated;
grant execute on function public.reorder_participation_levels(uuid[]) to authenticated;

-- =============================================================================
-- END 20260715000003_participation_levels.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000004_representatives.sql
-- =============================================================================

-- One primary representative per company + atomic set_primary RPC.

-- Resolve existing duplicates before unique index
with ranked as (
  select
    id,
    row_number() over (partition by company_id order by created_at asc, id asc) as rn
  from public.representatives
  where is_primary = true
)
update public.representatives r
set is_primary = false
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists representatives_one_primary_per_company_idx
  on public.representatives (company_id)
  where is_primary = true;

create or replace function public.set_primary_representative(p_representative_id uuid)
returns public.representatives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representatives;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_rep
  from public.representatives
  where id = p_representative_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  if not v_rep.is_active then
    raise exception 'inactive_representative_cannot_be_primary' using errcode = 'P0001';
  end if;

  update public.representatives
  set is_primary = false
  where company_id = v_rep.company_id
    and is_primary = true
    and id <> p_representative_id;

  update public.representatives
  set is_primary = true
  where id = p_representative_id
  returning * into v_rep;

  return v_rep;
end;
$$;

create or replace function public.upsert_representative(
  p_id uuid default null,
  p_company_id uuid default null,
  p_full_name text default null,
  p_position text default null,
  p_phone text default null,
  p_email text default null,
  p_pd_consent boolean default null,
  p_is_primary boolean default null,
  p_is_active boolean default null
)
returns public.representatives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representatives;
  v_company_id uuid;
  v_make_primary boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_id is null then
    if p_company_id is null or nullif(trim(p_full_name), '') is null then
      raise exception 'company_and_full_name_required' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;

    v_make_primary := coalesce(p_is_primary, false);

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      trim(p_full_name),
      nullif(trim(p_position), ''),
      nullif(trim(p_phone), ''),
      nullif(lower(trim(p_email)), ''),
      coalesce(p_pd_consent, false),
      case when coalesce(p_pd_consent, false) then now() else null end,
      false,
      coalesce(p_is_active, true)
    )
    returning * into v_rep;

    if v_make_primary then
      return public.set_primary_representative(v_rep.id);
    end if;

    return v_rep;
  end if;

  select * into v_rep
  from public.representatives
  where id = p_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  v_company_id := coalesce(p_company_id, v_rep.company_id);

  if p_company_id is not null and p_company_id <> v_rep.company_id then
    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;
  end if;

  update public.representatives
  set
    company_id = v_company_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    position = case when p_position is null then position else nullif(trim(p_position), '') end,
    phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end,
    email = case when p_email is null then email else nullif(lower(trim(p_email)), '') end,
    pd_consent = coalesce(p_pd_consent, pd_consent),
    pd_consent_date = case
      when p_pd_consent is true and not pd_consent then now()
      when p_pd_consent is false then null
      else pd_consent_date
    end,
    is_active = coalesce(p_is_active, is_active),
    is_primary = case
      when coalesce(p_is_active, is_active) is false then false
      else is_primary
    end
  where id = p_id
  returning * into v_rep;

  if coalesce(p_is_primary, false) and v_rep.is_active then
    return public.set_primary_representative(v_rep.id);
  end if;

  if p_is_primary is false then
    update public.representatives
    set is_primary = false
    where id = p_id
    returning * into v_rep;
  end if;

  return v_rep;
end;
$$;

grant execute on function public.set_primary_representative(uuid) to authenticated;
grant execute on function public.upsert_representative(uuid, uuid, text, text, text, text, boolean, boolean, boolean) to authenticated;

-- =============================================================================
-- END 20260715000004_representatives.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000005_materials.sql
-- =============================================================================

-- Materials: sections, level ACL, documents, reorder & ACL RPCs.

create table if not exists public.material_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  content text,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_section_levels (
  id uuid primary key default gen_random_uuid(),
  material_section_id uuid not null references public.material_sections (id) on delete cascade,
  participation_level_id uuid not null references public.participation_levels (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (material_section_id, participation_level_id)
);

create table if not exists public.material_documents (
  id uuid primary key default gen_random_uuid(),
  material_section_id uuid not null references public.material_sections (id) on delete cascade,
  title text not null,
  file_url text not null,
  file_size bigint,
  mime_type text,
  sort_order integer not null default 0,
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists material_sections_sort_idx
  on public.material_sections (sort_order, title);

create index if not exists material_sections_published_idx
  on public.material_sections (is_published);

create index if not exists material_section_levels_section_idx
  on public.material_section_levels (material_section_id);

create index if not exists material_section_levels_level_idx
  on public.material_section_levels (participation_level_id);

create index if not exists material_documents_section_idx
  on public.material_documents (material_section_id, sort_order);

drop trigger if exists material_sections_set_updated_at on public.material_sections;
create trigger material_sections_set_updated_at
before update on public.material_sections
for each row execute function public.set_updated_at();

alter table public.material_sections enable row level security;
alter table public.material_section_levels enable row level security;
alter table public.material_documents enable row level security;

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
  or (
    is_published = true
    and exists (
      select 1
      from public.users u
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      join public.material_section_levels msl
        on msl.material_section_id = material_sections.id
       and msl.participation_level_id = c.participation_level_id
      where u.id = auth.uid()
        and u.role = 'member'
        and u.status = 'confirmed'
        and c.access_status = 'active'
        and c.participation_level_id is not null
    )
  )
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
  or exists (
    select 1 from public.material_sections s
    where s.id = material_section_levels.material_section_id
      and s.is_published = true
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
  or exists (
    select 1 from public.material_sections s
    where s.id = material_documents.material_section_id
      and s.is_published = true
  )
);

create or replace function public.reorder_material_sections(p_ordered_ids uuid[])
returns setof public.material_sections
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
    update public.material_sections
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'section_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.material_sections
    order by sort_order asc, title asc;
end;
$$;

create or replace function public.set_material_section_levels(
  p_section_id uuid,
  p_level_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.material_sections where id = p_section_id) then
    raise exception 'section_not_found' using errcode = 'P0002';
  end if;

  delete from public.material_section_levels
  where material_section_id = p_section_id;

  if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
    insert into public.material_section_levels (material_section_id, participation_level_id)
    select p_section_id, unnest(p_level_ids);
  end if;
end;
$$;

grant execute on function public.reorder_material_sections(uuid[]) to authenticated;
grant execute on function public.set_material_section_levels(uuid, uuid[]) to authenticated;

-- =============================================================================
-- END 20260715000005_materials.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000006_material_documents_storage.sql
-- =============================================================================

-- Storage bucket for material documents + reorder RPC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-documents',
  'material-documents',
  false,
  26214400, -- 25 MiB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists material_documents_storage_admin_all on storage.objects;
create policy material_documents_storage_admin_all
on storage.objects for all to authenticated
using (
  bucket_id = 'material-documents'
  and public.is_admin()
)
with check (
  bucket_id = 'material-documents'
  and public.is_admin()
);

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
      join public.material_sections s on s.id = d.material_section_id
      join public.users u on u.id = auth.uid()
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      join public.material_section_levels msl
        on msl.material_section_id = s.id
       and msl.participation_level_id = c.participation_level_id
      where d.file_url = name
        and s.is_published = true
        and u.role = 'member'
        and u.status = 'confirmed'
        and c.access_status = 'active'
    )
  )
);

create or replace function public.reorder_material_documents(
  p_section_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.material_documents
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

  if not exists (select 1 from public.material_sections where id = p_section_id) then
    raise exception 'section_not_found' using errcode = 'P0002';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.material_documents
    set sort_order = v_index
    where id = v_id
      and material_section_id = p_section_id;

    if not found then
      raise exception 'document_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.material_documents
    where material_section_id = p_section_id
    order by sort_order asc, title asc;
end;
$$;

grant execute on function public.reorder_material_documents(uuid, uuid[]) to authenticated;

-- =============================================================================
-- END 20260715000006_material_documents_storage.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000007_bulk_material_section_levels.sql
-- =============================================================================

-- Bulk ACL for material sections + helper to read max sort_order cheaply.

create or replace function public.bulk_set_material_section_levels(
  p_section_ids uuid[],
  p_level_ids uuid[],
  p_mode text default 'replace'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
  v_mode text := lower(coalesce(p_mode, 'replace'));
  v_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_section_ids is null or array_length(p_section_ids, 1) is null then
    raise exception 'section_ids_required' using errcode = 'P0001';
  end if;

  if v_mode not in ('replace', 'add', 'remove') then
    raise exception 'invalid_mode' using errcode = 'P0001';
  end if;

  foreach v_section_id in array p_section_ids loop
    if not exists (select 1 from public.material_sections where id = v_section_id) then
      raise exception 'section_not_found' using errcode = 'P0002';
    end if;

    if v_mode = 'replace' then
      delete from public.material_section_levels
      where material_section_id = v_section_id;

      if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
        insert into public.material_section_levels (material_section_id, participation_level_id)
        select distinct v_section_id, level_id
        from unnest(p_level_ids) as level_id
        on conflict do nothing;
      end if;
    elsif v_mode = 'add' then
      if p_level_ids is null or array_length(p_level_ids, 1) is null then
        raise exception 'level_ids_required' using errcode = 'P0001';
      end if;

      insert into public.material_section_levels (material_section_id, participation_level_id)
      select distinct v_section_id, level_id
      from unnest(p_level_ids) as level_id
      on conflict do nothing;
    else
      -- remove
      if p_level_ids is null or array_length(p_level_ids, 1) is null then
        raise exception 'level_ids_required' using errcode = 'P0001';
      end if;

      delete from public.material_section_levels
      where material_section_id = v_section_id
        and participation_level_id = any (p_level_ids);
    end if;

    update public.material_sections
    set updated_at = now()
    where id = v_section_id;

    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

grant execute on function public.bulk_set_material_section_levels(uuid[], uuid[], text) to authenticated;

-- =============================================================================
-- END 20260715000007_bulk_material_section_levels.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000008_cabinet_material_rls.sql
-- =============================================================================

-- Harden material ACL for members: shared visibility helper + strict policies.
-- Closed / unpublished materials must be unreachable via table SELECT (not only UI).

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

revoke all on function public.member_can_access_material_section(uuid) from public;
grant execute on function public.member_can_access_material_section(uuid) to authenticated;

drop policy if exists material_sections_member_read on public.material_sections;
create policy material_sections_member_read
on public.material_sections for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_material_section(id)
);

drop policy if exists material_section_levels_member_read on public.material_section_levels;
create policy material_section_levels_member_read
on public.material_section_levels for select to authenticated
using (
  public.is_admin()
  or (
    public.member_can_access_material_section(material_section_id)
    and exists (
      select 1
      from public.users u
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      where u.id = auth.uid()
        and c.participation_level_id = material_section_levels.participation_level_id
    )
  )
);

drop policy if exists material_documents_member_read on public.material_documents;
create policy material_documents_member_read
on public.material_documents for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_material_section(material_section_id)
);

-- Align storage object read with the same helper (path = material_documents.file_url).
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

-- =============================================================================
-- END 20260715000008_cabinet_material_rls.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000009_work_groups.sql
-- =============================================================================

-- Work groups + members + links + messenger_connections (Telegram/Max ready).

do $$ begin
  create type public.work_group_status as enum ('active', 'paused', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.messenger_platform as enum ('telegram', 'max');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.bot_status as enum ('pending', 'connected', 'error');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_source as enum ('telegram', 'max');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.delivery_status as enum ('received', 'stored', 'failed', 'relayed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.relay_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.work_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  responsible_representative_id uuid references public.representatives (id) on delete set null,
  status public.work_group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_group_members (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  representative_id uuid not null references public.representatives (id) on delete cascade,
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (work_group_id, representative_id)
);

create table if not exists public.work_group_links (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  title text not null,
  url text,
  file_url text,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Future Telegram / Max bot bindings (one row per platform per group).
create table if not exists public.messenger_connections (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  platform public.messenger_platform not null,
  chat_id text not null,
  chat_title text,
  bot_status public.bot_status not null default 'pending',
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (work_group_id, platform)
);

create index if not exists work_groups_status_idx on public.work_groups (status);
create index if not exists work_groups_responsible_idx
  on public.work_groups (responsible_representative_id);
create index if not exists work_group_members_group_idx
  on public.work_group_members (work_group_id);
create index if not exists work_group_members_rep_idx
  on public.work_group_members (representative_id);
create index if not exists work_group_links_group_idx
  on public.work_group_links (work_group_id, sort_order);
create index if not exists messenger_connections_group_idx
  on public.messenger_connections (work_group_id);

drop trigger if exists work_groups_set_updated_at on public.work_groups;
create trigger work_groups_set_updated_at
before update on public.work_groups
for each row execute function public.set_updated_at();

alter table public.work_groups enable row level security;
alter table public.work_group_members enable row level security;
alter table public.work_group_links enable row level security;
alter table public.messenger_connections enable row level security;

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
  or exists (
    select 1
    from public.users u
    join public.work_group_members m
      on m.representative_id = u.representative_id
     and m.work_group_id = work_groups.id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
      and work_groups.status <> 'archived'
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
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
      and u.representative_id = work_group_members.representative_id
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
  or exists (
    select 1
    from public.users u
    join public.work_group_members m
      on m.representative_id = u.representative_id
     and m.work_group_id = work_group_links.work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

drop policy if exists messenger_connections_admin_all on public.messenger_connections;
create policy messenger_connections_admin_all
on public.messenger_connections for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Members may see connection status of their groups (not secrets — chat_id is operational).
drop policy if exists messenger_connections_member_read on public.messenger_connections;
create policy messenger_connections_member_read
on public.messenger_connections for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.work_group_members m
      on m.representative_id = u.representative_id
     and m.work_group_id = messenger_connections.work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

-- Storage bucket reserved for work-group file links (worker / admin uploads later).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-group-files',
  'work-group-files',
  false,
  52428800,
  null
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists work_group_files_admin_all on storage.objects;
create policy work_group_files_admin_all
on storage.objects for all to authenticated
using (bucket_id = 'work-group-files' and public.is_admin())
with check (bucket_id = 'work-group-files' and public.is_admin());

-- =============================================================================
-- END 20260715000009_work_groups.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000010_work_group_members_bulk.sql
-- =============================================================================

-- Bulk add work group members (duplicate-safe) + helper indexes.

create or replace function public.bulk_add_work_group_members(
  p_work_group_id uuid,
  p_representative_ids uuid[],
  p_added_by uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.work_groups where id = p_work_group_id) then
    raise exception 'work_group_not_found' using errcode = 'P0002';
  end if;

  if p_representative_ids is null or array_length(p_representative_ids, 1) is null then
    raise exception 'representative_ids_required' using errcode = 'P0001';
  end if;

  with candidates as (
    select distinct unnest(p_representative_ids) as representative_id
  ),
  valid as (
    select c.representative_id
    from candidates c
    join public.representatives r on r.id = c.representative_id
  ),
  inserted as (
    insert into public.work_group_members (work_group_id, representative_id, added_by)
    select p_work_group_id, v.representative_id, p_added_by
    from valid v
    on conflict (work_group_id, representative_id) do nothing
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  update public.work_groups
  set updated_at = now()
  where id = p_work_group_id;

  return v_inserted;
end;
$$;

grant execute on function public.bulk_add_work_group_members(uuid, uuid[], uuid) to authenticated;

create index if not exists work_group_members_rep_group_idx
  on public.work_group_members (representative_id, work_group_id);

-- =============================================================================
-- END 20260715000010_work_group_members_bulk.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000011_work_group_links.sql
-- =============================================================================

-- Work group links: file metadata, reorder RPC, member storage read.

alter table public.work_group_links
  add column if not exists file_size bigint,
  add column if not exists mime_type text;

create or replace function public.reorder_work_group_links(
  p_work_group_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.work_group_links
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

  if not exists (select 1 from public.work_groups where id = p_work_group_id) then
    raise exception 'work_group_not_found' using errcode = 'P0002';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.work_group_links
    set sort_order = v_index
    where id = v_id
      and work_group_id = p_work_group_id;

    if not found then
      raise exception 'link_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  update public.work_groups
  set updated_at = now()
  where id = p_work_group_id;

  return query
    select *
    from public.work_group_links
    where work_group_id = p_work_group_id
    order by sort_order asc, title asc;
end;
$$;

grant execute on function public.reorder_work_group_links(uuid, uuid[]) to authenticated;

-- Members of the group may download files via signed URLs (path = work_group_links.file_url).
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
      join public.work_group_members m on m.work_group_id = l.work_group_id
      join public.users u on u.representative_id = m.representative_id
      where l.file_url = name
        and u.id = auth.uid()
        and u.role = 'member'
        and u.status = 'confirmed'
    )
  )
);

-- Tighten bucket MIME allow-list (50 MiB already set).
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed'
  ]
where id = 'work-group-files';

-- =============================================================================
-- END 20260715000011_work_group_links.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000012_polls.sql
-- =============================================================================

-- Polls: CRUD foundation, options, level ACL, cast_vote RPC.

do $$ begin
  create type public.vote_mode as enum ('per_company', 'per_representative');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.poll_status as enum ('draft', 'active', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  vote_mode public.vote_mode not null default 'per_company',
  starts_at timestamptz,
  ends_at timestamptz,
  status public.poll_status not null default 'draft',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint polls_period_chk check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_level_access (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  participation_level_id uuid not null references public.participation_levels (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, participation_level_id)
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  poll_option_id uuid not null references public.poll_options (id) on delete cascade,
  representative_id uuid not null references public.representatives (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  voted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists poll_votes_per_representative_uidx
  on public.poll_votes (poll_id, representative_id);

create index if not exists poll_votes_company_idx
  on public.poll_votes (poll_id, company_id);

create index if not exists polls_status_idx on public.polls (status);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id, sort_order);
create index if not exists poll_level_access_poll_idx on public.poll_level_access (poll_id);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_level_access enable row level security;
alter table public.poll_votes enable row level security;

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
  or (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and exists (
      select 1
      from public.users u
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      join public.poll_level_access pla
        on pla.poll_id = polls.id
       and pla.participation_level_id = c.participation_level_id
      where u.id = auth.uid()
        and u.role = 'member'
        and u.status = 'confirmed'
        and c.access_status = 'active'
    )
  )
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
  or exists (
    select 1 from public.polls p
    where p.id = poll_options.poll_id
      and p.status = 'active'
  )
);

drop policy if exists poll_level_access_admin_all on public.poll_level_access;
create policy poll_level_access_admin_all
on public.poll_level_access for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists poll_level_access_member_read on public.poll_level_access;
create policy poll_level_access_member_read
on public.poll_level_access for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.polls p where p.id = poll_level_access.poll_id and p.status = 'active'
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
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.representative_id = poll_votes.representative_id
  )
);

-- Inserts only via cast_vote RPC (security definer).
drop policy if exists poll_votes_no_direct_write on public.poll_votes;
create policy poll_votes_no_direct_write
on public.poll_votes for insert to authenticated
with check (false);

create or replace function public.set_poll_levels(
  p_poll_id uuid,
  p_level_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls where id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  delete from public.poll_level_access where poll_id = p_poll_id;

  if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
    insert into public.poll_level_access (poll_id, participation_level_id)
    select distinct p_poll_id, level_id
    from unnest(p_level_ids) as level_id
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.set_poll_levels(uuid, uuid[]) to authenticated;

create or replace function public.replace_poll_options(
  p_poll_id uuid,
  p_texts text[]
)
returns setof public.poll_options
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.poll_status;
  v_text text;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status from public.polls where id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' and exists (select 1 from public.poll_votes where poll_id = p_poll_id) then
    raise exception 'options_locked' using errcode = 'P0001';
  end if;

  if p_texts is null or coalesce(array_length(p_texts, 1), 0) < 2 then
    raise exception 'options_min_two' using errcode = 'P0001';
  end if;

  delete from public.poll_options where poll_id = p_poll_id;

  foreach v_text in array p_texts loop
    if trim(v_text) = '' then
      raise exception 'option_empty' using errcode = 'P0001';
    end if;
    insert into public.poll_options (poll_id, text, sort_order)
    values (p_poll_id, left(trim(v_text), 500), v_index);
    v_index := v_index + 1;
  end loop;

  return query
    select * from public.poll_options
    where poll_id = p_poll_id
    order by sort_order asc;
end;
$$;

grant execute on function public.replace_poll_options(uuid, text[]) to authenticated;

create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if not found or v_user.role <> 'member' or v_user.status <> 'confirmed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives where id = v_user.representative_id;
  select * into v_company from public.companies where id = v_rep.company_id;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found or v_poll.status <> 'active' then
    raise exception 'poll_not_active' using errcode = 'P0001';
  end if;

  if v_poll.starts_at is not null and v_poll.starts_at > now() then
    raise exception 'poll_not_started' using errcode = 'P0001';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at < now() then
    raise exception 'poll_ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.poll_level_access pla
    where pla.poll_id = p_poll_id
      and pla.participation_level_id = v_company.participation_level_id
  ) then
    raise exception 'poll_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  if v_poll.vote_mode = 'per_company' then
    if exists (select 1 from public.poll_votes where poll_id = p_poll_id and company_id = v_company.id) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    if exists (
      select 1 from public.poll_votes
      where poll_id = p_poll_id and representative_id = v_rep.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  end if;

  insert into public.poll_votes (poll_id, poll_option_id, representative_id, company_id)
  values (p_poll_id, p_option_id, v_rep.id, v_company.id)
  returning * into v_vote;

  return v_vote;
end;
$$;

grant execute on function public.cast_vote(uuid, uuid) to authenticated;

-- =============================================================================
-- END 20260715000012_polls.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000013_member_poll_voting.sql
-- =============================================================================

-- Member voting: company vote visibility, cast_vote race hardening.

drop policy if exists poll_votes_member_read_own on public.poll_votes;
create policy poll_votes_member_read_own
on public.poll_votes for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.representatives r on r.id = u.representative_id
    join public.polls p on p.id = poll_votes.poll_id
    where u.id = auth.uid()
      and u.role = 'member'
      and (
        poll_votes.representative_id = u.representative_id
        or (
          p.vote_mode = 'per_company'
          and poll_votes.company_id = r.company_id
        )
      )
  )
);

-- Options only for polls the member can see (active + ACL via polls RLS pattern).
drop policy if exists poll_options_member_read on public.poll_options;
create policy poll_options_member_read
on public.poll_options for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.polls p
    join public.users u on u.id = auth.uid()
    join public.representatives r on r.id = u.representative_id
    join public.companies c on c.id = r.company_id
    join public.poll_level_access pla
      on pla.poll_id = p.id
     and pla.participation_level_id = c.participation_level_id
    where p.id = poll_options.poll_id
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
  )
);

create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if not found or v_user.role <> 'member' or v_user.status <> 'confirmed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives where id = v_user.representative_id;
  if not found then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_company from public.companies where id = v_rep.company_id;
  if not found then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found or v_poll.status <> 'active' then
    raise exception 'poll_not_active' using errcode = 'P0001';
  end if;

  if v_poll.starts_at is not null and v_poll.starts_at > now() then
    raise exception 'poll_not_started' using errcode = 'P0001';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at < now() then
    raise exception 'poll_ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.poll_level_access pla
    where pla.poll_id = p_poll_id
      and pla.participation_level_id = v_company.participation_level_id
  ) then
    raise exception 'poll_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  -- Serialize concurrent votes for the same poll+scope (covers per_company races).
  if v_poll.vote_mode = 'per_company' then
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':c:' || v_company.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes
      where poll_id = p_poll_id and company_id = v_company.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':r:' || v_rep.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes
      where poll_id = p_poll_id and representative_id = v_rep.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.poll_votes (poll_id, poll_option_id, representative_id, company_id)
    values (p_poll_id, p_option_id, v_rep.id, v_company.id)
    returning * into v_vote;
  exception
    when unique_violation then
      raise exception 'already_voted' using errcode = 'P0001';
  end;

  return v_vote;
end;
$$;

grant execute on function public.cast_vote(uuid, uuid) to authenticated;

-- =============================================================================
-- END 20260715000013_member_poll_voting.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000014_poll_results.sql
-- =============================================================================

-- Admin poll results: aggregate RPC + votes listing + covering index.

create index if not exists poll_votes_poll_option_idx
  on public.poll_votes (poll_id, poll_option_id);

create or replace function public.get_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls%rowtype;
  v_votes_total integer;
  v_companies_voted integer;
  v_eligible integer;
  v_first timestamptz;
  v_last timestamptz;
  v_options jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(distinct company_id)::integer,
    min(voted_at),
    max(voted_at)
  into v_votes_total, v_companies_voted, v_first, v_last
  from public.poll_votes
  where poll_id = p_poll_id;

  if v_poll.vote_mode = 'per_company' then
    select count(*)::integer into v_eligible
    from public.companies c
    where c.access_status = 'active'
      and c.participation_level_id in (
        select pla.participation_level_id
        from public.poll_level_access pla
        where pla.poll_id = p_poll_id
      );
  else
    select count(*)::integer into v_eligible
    from public.representatives r
    join public.companies c on c.id = r.company_id
    where r.is_active = true
      and c.access_status = 'active'
      and c.participation_level_id in (
        select pla.participation_level_id
        from public.poll_level_access pla
        where pla.poll_id = p_poll_id
      );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'text', o.text,
        'sort_order', o.sort_order,
        'votes_count', o.votes_count,
        'share', case
          when v_votes_total > 0 then round((o.votes_count::numeric / v_votes_total::numeric), 4)
          else 0
        end
      )
      order by o.sort_order asc, o.text asc
    ),
    '[]'::jsonb
  )
  into v_options
  from (
    select
      po.id,
      po.text,
      po.sort_order,
      count(pv.id)::integer as votes_count
    from public.poll_options po
    left join public.poll_votes pv
      on pv.poll_option_id = po.id
     and pv.poll_id = p_poll_id
    where po.poll_id = p_poll_id
    group by po.id, po.text, po.sort_order
  ) o;

  return jsonb_build_object(
    'poll_id', v_poll.id,
    'title', v_poll.title,
    'vote_mode', v_poll.vote_mode,
    'status', v_poll.status,
    'votes_total', coalesce(v_votes_total, 0),
    'companies_voted', coalesce(v_companies_voted, 0),
    'eligible_total', coalesce(v_eligible, 0),
    'turnout_share', case
      when coalesce(v_eligible, 0) > 0
        then round((coalesce(v_votes_total, 0)::numeric / v_eligible::numeric), 4)
      else 0
    end,
    'first_voted_at', v_first,
    'last_voted_at', v_last,
    'options', v_options
  );
end;
$$;

grant execute on function public.get_poll_results(uuid) to authenticated;

create or replace function public.list_poll_votes_admin(p_poll_id uuid)
returns table (
  id uuid,
  voted_at timestamptz,
  option_id uuid,
  option_text text,
  option_sort_order integer,
  representative_id uuid,
  representative_name text,
  representative_email text,
  company_id uuid,
  company_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls where id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    pv.id,
    pv.voted_at,
    po.id as option_id,
    po.text as option_text,
    po.sort_order as option_sort_order,
    r.id as representative_id,
    r.full_name as representative_name,
    r.email as representative_email,
    c.id as company_id,
    c.name as company_name
  from public.poll_votes pv
  join public.poll_options po on po.id = pv.poll_option_id
  join public.representatives r on r.id = pv.representative_id
  join public.companies c on c.id = pv.company_id
  where pv.poll_id = p_poll_id
  order by pv.voted_at desc, r.full_name asc;
end;
$$;

grant execute on function public.list_poll_votes_admin(uuid) to authenticated;

-- =============================================================================
-- END 20260715000014_poll_results.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000015_messages.sql
-- =============================================================================

-- Message history tables + enum alignment for delivery/relay statuses.

create extension if not exists pg_trgm;

do $$ begin
  alter type public.delivery_status add value if not exists 'relayed';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  source public.message_source not null,
  external_chat_id text not null,
  external_message_id text not null,
  author_name text,
  author_external_id text,
  text text not null,
  sent_at timestamptz not null,
  delivery_status public.delivery_status not null default 'received',
  created_at timestamptz not null default now(),
  unique (work_group_id, source, external_message_id)
);

create table if not exists public.message_relays (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  target_platform public.messenger_platform not null,
  target_chat_id text not null,
  target_external_message_id text,
  status public.relay_status not null default 'pending',
  relayed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_group_sent_idx
  on public.messages (work_group_id, sent_at desc);

create index if not exists messages_sent_idx
  on public.messages (sent_at desc);

create index if not exists messages_source_idx
  on public.messages (source);

create index if not exists messages_delivery_status_idx
  on public.messages (delivery_status);

create index if not exists messages_text_trgm_idx
  on public.messages using gin (text gin_trgm_ops);

create index if not exists messages_author_trgm_idx
  on public.messages using gin (author_name gin_trgm_ops);

create index if not exists message_relays_message_idx
  on public.message_relays (message_id);

alter table public.messages enable row level security;
alter table public.message_relays enable row level security;

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
  or exists (
    select 1
    from public.users u
    join public.work_group_members wgm
      on wgm.representative_id = u.representative_id
     and wgm.work_group_id = messages.work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

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
    select 1
    from public.messages m
    join public.users u on u.id = auth.uid()
    join public.work_group_members wgm
      on wgm.representative_id = u.representative_id
     and wgm.work_group_id = m.work_group_id
    where m.id = message_relays.message_id
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

-- =============================================================================
-- END 20260715000015_messages.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000016_audit_log.sql
-- =============================================================================

-- Audit log for administrative operations.

create extension if not exists pg_trgm;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

create index if not exists audit_log_action_idx
  on public.audit_log (action);

create index if not exists audit_log_user_idx
  on public.audit_log (user_id);

create index if not exists audit_log_action_trgm_idx
  on public.audit_log using gin (action gin_trgm_ops);

create index if not exists audit_log_entity_type_trgm_idx
  on public.audit_log using gin (entity_type gin_trgm_ops);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select
on public.audit_log for select to authenticated
using (public.is_admin());

-- Direct inserts blocked; use write_audit_log RPC.
drop policy if exists audit_log_no_direct_insert on public.audit_log;
create policy audit_log_no_direct_insert
on public.audit_log for insert to authenticated
with check (false);

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_payload jsonb default null
)
returns public.audit_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.audit_log%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- Only admins write admin audit; members should not fill this journal.
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action is null or trim(p_action) = '' then
    raise exception 'action_required' using errcode = 'P0001';
  end if;
  if p_entity_type is null or trim(p_entity_type) = '' then
    raise exception 'entity_type_required' using errcode = 'P0001';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    left(trim(p_action), 120),
    left(trim(p_entity_type), 120),
    case when p_entity_id is null or trim(p_entity_id) = '' then null else left(trim(p_entity_id), 120) end,
    p_payload
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.write_audit_log(text, text, text, jsonb) to authenticated;

-- =============================================================================
-- END 20260715000016_audit_log.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000017_rls_hardening.sql
-- =============================================================================

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

-- =============================================================================
-- END 20260715000017_rls_hardening.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000018_fix_security_definer_helpers.sql
-- =============================================================================

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

-- =============================================================================
-- END 20260715000018_fix_security_definer_helpers.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000019_fix_poll_rpcs.sql
-- =============================================================================

-- =============================================================================
-- Fix poll RPCs under FORCE ROW LEVEL SECURITY + ambiguous "id"
-- =============================================================================
-- Symptoms:
--   - get_poll_results / list_poll_votes_admin: column reference "id" is ambiguous
--   - cast_vote / replace_poll_options fail RLS WITH CHECK under FORCE RLS
--
-- Fixes:
--   1) SET row_security = off on poll SECURITY DEFINER RPCs
--   2) Qualify table columns (polls.id, …) — RETURNS TABLE(id …) makes bare `id`
--      refer to the output parameter
--   3) Qualify polls.id in RLS policies used in multi-table queries
-- =============================================================================

-- --- Policies: avoid bare `id` (ambiguous when polls is joined) -------------
drop policy if exists polls_member_read on public.polls;
create policy polls_member_read
on public.polls for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_poll(polls.id)
);

-- --- get_poll_results --------------------------------------------------------
create or replace function public.get_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_poll public.polls%rowtype;
  v_votes_total integer;
  v_companies_voted integer;
  v_eligible integer;
  v_first timestamptz;
  v_last timestamptz;
  v_options jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_poll from public.polls p where p.id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(distinct poll_votes.company_id)::integer,
    min(poll_votes.voted_at),
    max(poll_votes.voted_at)
  into v_votes_total, v_companies_voted, v_first, v_last
  from public.poll_votes
  where poll_votes.poll_id = p_poll_id;

  if v_poll.vote_mode = 'per_company' then
    select count(*)::integer into v_eligible
    from public.companies c
    where c.access_status = 'active'
      and c.participation_level_id in (
        select pla.participation_level_id
        from public.poll_level_access pla
        where pla.poll_id = p_poll_id
      );
  else
    select count(*)::integer into v_eligible
    from public.representatives r
    join public.companies c on c.id = r.company_id
    where r.is_active = true
      and c.access_status = 'active'
      and c.participation_level_id in (
        select pla.participation_level_id
        from public.poll_level_access pla
        where pla.poll_id = p_poll_id
      );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.option_id,
        'text', o.option_text,
        'sort_order', o.sort_order,
        'votes_count', o.votes_count,
        'share', case
          when v_votes_total > 0 then round((o.votes_count::numeric / v_votes_total::numeric), 4)
          else 0
        end
      )
      order by o.sort_order asc, o.option_text asc
    ),
    '[]'::jsonb
  )
  into v_options
  from (
    select
      po.id as option_id,
      po.text as option_text,
      po.sort_order,
      count(pv.id)::integer as votes_count
    from public.poll_options po
    left join public.poll_votes pv
      on pv.poll_option_id = po.id
     and pv.poll_id = p_poll_id
    where po.poll_id = p_poll_id
    group by po.id, po.text, po.sort_order
  ) o;

  return jsonb_build_object(
    'poll_id', v_poll.id,
    'title', v_poll.title,
    'vote_mode', v_poll.vote_mode,
    'status', v_poll.status,
    'votes_total', coalesce(v_votes_total, 0),
    'companies_voted', coalesce(v_companies_voted, 0),
    'eligible_total', coalesce(v_eligible, 0),
    'turnout_share', case
      when coalesce(v_eligible, 0) > 0
        then round((coalesce(v_votes_total, 0)::numeric / v_eligible::numeric), 4)
      else 0
    end,
    'first_voted_at', v_first,
    'last_voted_at', v_last,
    'options', v_options
  );
end;
$$;

-- --- list_poll_votes_admin ---------------------------------------------------
create or replace function public.list_poll_votes_admin(p_poll_id uuid)
returns table (
  id uuid,
  voted_at timestamptz,
  option_id uuid,
  option_text text,
  option_sort_order integer,
  representative_id uuid,
  representative_name text,
  representative_email text,
  company_id uuid,
  company_name text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls p where p.id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    pv.id,
    pv.voted_at,
    po.id,
    po.text,
    po.sort_order,
    r.id,
    r.full_name,
    r.email,
    c.id,
    c.name
  from public.poll_votes pv
  join public.poll_options po on po.id = pv.poll_option_id
  join public.representatives r on r.id = pv.representative_id
  join public.companies c on c.id = pv.company_id
  where pv.poll_id = p_poll_id
  order by pv.voted_at desc, r.full_name asc;
end;
$$;

-- --- cast_vote ---------------------------------------------------------------
create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
begin
  select * into v_user from public.users u where u.id = auth.uid();
  if not found or v_user.role <> 'member' or v_user.status <> 'confirmed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives r where r.id = v_user.representative_id;
  if not found then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_company from public.companies c where c.id = v_rep.company_id;
  if not found then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls p where p.id = p_poll_id;
  if not found or v_poll.status <> 'active' then
    raise exception 'poll_not_active' using errcode = 'P0001';
  end if;

  if v_poll.starts_at is not null and v_poll.starts_at > now() then
    raise exception 'poll_not_started' using errcode = 'P0001';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at < now() then
    raise exception 'poll_ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.poll_level_access pla
    where pla.poll_id = p_poll_id
      and pla.participation_level_id = v_company.participation_level_id
  ) then
    raise exception 'poll_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.poll_options o
    where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  if v_poll.vote_mode = 'per_company' then
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':c:' || v_company.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes v
      where v.poll_id = p_poll_id and v.company_id = v_company.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':r:' || v_rep.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes v
      where v.poll_id = p_poll_id and v.representative_id = v_rep.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.poll_votes (poll_id, poll_option_id, representative_id, company_id)
    values (p_poll_id, p_option_id, v_rep.id, v_company.id)
    returning * into v_vote;
  exception
    when unique_violation then
      raise exception 'already_voted' using errcode = 'P0001';
  end;

  return v_vote;
end;
$$;

-- --- replace_poll_options ----------------------------------------------------
create or replace function public.replace_poll_options(
  p_poll_id uuid,
  p_texts text[]
)
returns setof public.poll_options
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_status public.poll_status;
  v_text text;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.status into v_status from public.polls p where p.id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' and exists (
    select 1 from public.poll_votes v where v.poll_id = p_poll_id
  ) then
    raise exception 'options_locked' using errcode = 'P0001';
  end if;

  if p_texts is null or coalesce(array_length(p_texts, 1), 0) < 2 then
    raise exception 'options_min_two' using errcode = 'P0001';
  end if;

  delete from public.poll_options o where o.poll_id = p_poll_id;

  foreach v_text in array p_texts loop
    if trim(v_text) = '' then
      raise exception 'option_empty' using errcode = 'P0001';
    end if;
    insert into public.poll_options (poll_id, text, sort_order)
    values (p_poll_id, left(trim(v_text), 500), v_index);
    v_index := v_index + 1;
  end loop;

  return query
    select o.*
    from public.poll_options o
    where o.poll_id = p_poll_id
    order by o.sort_order asc;
end;
$$;

-- --- set_poll_levels ---------------------------------------------------------
create or replace function public.set_poll_levels(
  p_poll_id uuid,
  p_level_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls p where p.id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  delete from public.poll_level_access pla where pla.poll_id = p_poll_id;

  if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
    insert into public.poll_level_access (poll_id, participation_level_id)
    select distinct p_poll_id, level_id
    from unnest(p_level_ids) as level_id
    on conflict do nothing;
  end if;
end;
$$;

-- Grants (reaffirm)
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'get_poll_results(uuid)',
    'list_poll_votes_admin(uuid)',
    'cast_vote(uuid,uuid)',
    'replace_poll_options(uuid,text[])',
    'set_poll_levels(uuid,uuid[])'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- =============================================================================
-- END 20260715000019_fix_poll_rpcs.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000020_company_inn_hint.sql
-- =============================================================================

-- Optional INN hint from public registration; pass through to companies on confirm.

alter table public.users
  add column if not exists company_inn_hint text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    company_inn_hint,
    pd_consent_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.confirm_registration(
  p_user_id uuid,
  p_representative_id uuid default null,
  p_create_representative jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_rep_id uuid;
  v_company_id uuid;
  v_existing_link uuid;
  v_company_inn text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' and v_user.representative_id is not null then
    raise exception 'use_set_user_status_to_unblock' using errcode = 'P0001';
  end if;

  if p_representative_id is not null and p_create_representative is not null then
    raise exception 'provide_either_existing_or_create' using errcode = 'P0001';
  end if;

  if p_representative_id is null and p_create_representative is null then
    raise exception 'representative_required' using errcode = 'P0001';
  end if;

  if p_representative_id is not null then
    if not exists (select 1 from public.representatives r where r.id = p_representative_id and r.is_active) then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;

    select u.id into v_existing_link
    from public.users u
    where u.representative_id = p_representative_id
      and u.id <> p_user_id
    limit 1;

    if v_existing_link is not null then
      raise exception 'representative_already_linked' using errcode = 'P0001';
    end if;

    v_rep_id := p_representative_id;
  else
    if p_create_representative ? 'company_id'
       and nullif(p_create_representative->>'company_id', '') is not null then
      v_company_id := (p_create_representative->>'company_id')::uuid;
      if not exists (select 1 from public.companies c where c.id = v_company_id) then
        raise exception 'company_not_found' using errcode = 'P0002';
      end if;
    else
      if nullif(p_create_representative->>'company_name', '') is null then
        raise exception 'company_required' using errcode = 'P0001';
      end if;

      v_company_inn := nullif(regexp_replace(
        coalesce(p_create_representative->>'company_inn', ''),
        '\D',
        '',
        'g'
      ), '');

      if v_company_inn is not null
         and v_company_inn !~ '^\d{10}(\d{2})?$' then
        raise exception 'invalid_company_inn' using errcode = 'P0001';
      end if;

      insert into public.companies (name, inn, access_status)
      values (
        trim(p_create_representative->>'company_name'),
        v_company_inn,
        'active'
      )
      returning id into v_company_id;
    end if;

    if nullif(p_create_representative->>'full_name', '') is null then
      raise exception 'representative_full_name_required' using errcode = 'P0001';
    end if;

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      v_company_id,
      trim(p_create_representative->>'full_name'),
      nullif(trim(p_create_representative->>'position'), ''),
      nullif(trim(p_create_representative->>'phone'), ''),
      nullif(lower(trim(p_create_representative->>'email')), ''),
      coalesce((p_create_representative->>'pd_consent')::boolean, true),
      case
        when coalesce((p_create_representative->>'pd_consent')::boolean, true)
          then coalesce(v_user.pd_consent_at, now())
        else null
      end,
      coalesce((p_create_representative->>'is_primary')::boolean, true),
      true
    )
    returning id into v_rep_id;
  end if;

  update public.users
  set
    status = 'confirmed',
    representative_id = v_rep_id,
    full_name = coalesce(nullif(trim(full_name), ''), (
      select r.full_name from public.representatives r where r.id = v_rep_id
    ))
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

-- =============================================================================
-- END 20260715000020_company_inn_hint.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000021_cabinet_directory_staff.sql
-- =============================================================================

-- Cabinet: member edits own company; association directory; APSS staff fields;
-- poll access diagnostics.

-- =============================================================================
-- 1) Staff profile fields on users (admins = APSS employees)
-- =============================================================================

alter table public.users
  add column if not exists staff_position text;

alter table public.users
  add column if not exists is_ceo boolean not null default false;

alter table public.users
  add column if not exists can_manage_work_groups boolean not null default true;

comment on column public.users.staff_position is 'Должность сотрудника АПСС (для role=admin)';
comment on column public.users.is_ceo is 'Гендиректор: может блокировать сотрудников АПСС';
comment on column public.users.can_manage_work_groups is 'Право курировать рабочие группы';

create or replace function public.is_ceo()
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
      and u.is_ceo is true
  );
$$;

revoke all on function public.is_ceo() from public;
grant execute on function public.is_ceo() to authenticated, service_role;

-- =============================================================================
-- 2) Member may update own company (admin-only columns protected by trigger)
-- =============================================================================

create or replace function public.protect_company_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Members cannot change access, level, or internal notes
  new.access_status := old.access_status;
  new.participation_level_id := old.participation_level_id;
  new.notes := old.notes;
  return new;
end;
$$;

drop trigger if exists companies_protect_member_columns on public.companies;
create trigger companies_protect_member_columns
before update on public.companies
for each row execute function public.protect_company_member_columns();

drop policy if exists companies_update_own_member on public.companies;
create policy companies_update_own_member
on public.companies for update to authenticated
using (
  public.is_confirmed_member()
  and id = public.current_company_id()
)
with check (
  public.is_confirmed_member()
  and id = public.current_company_id()
);

-- =============================================================================
-- 3) Association directory (active companies + active representatives)
-- =============================================================================

create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
begin
  if not (public.is_admin() or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', r.phone,
            'email', r.email,
            'is_primary', r.is_primary
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

revoke all on function public.list_association_directory() from public;
grant execute on function public.list_association_directory() to authenticated, service_role;

-- =============================================================================
-- 4) Staff management RPCs
-- =============================================================================

create or replace function public.list_staff_users()
returns setof public.users
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select u.*
  from public.users u
  where u.role = 'admin'
  order by u.is_ceo desc, u.full_name nulls last, u.email;
end;
$$;

revoke all on function public.list_staff_users() from public;
grant execute on function public.list_staff_users() to authenticated, service_role;

create or replace function public.promote_to_staff(
  p_user_id uuid,
  p_staff_position text default null,
  p_is_ceo boolean default false,
  p_can_manage_work_groups boolean default true
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_actor public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if coalesce(p_is_ceo, false) and not coalesce(v_actor.is_ceo, false) then
    raise exception 'only_ceo_can_assign_ceo' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role = 'admin' then
    raise exception 'already_staff' using errcode = 'P0001';
  end if;

  update public.users
  set
    role = 'admin',
    status = 'confirmed',
    representative_id = null,
    staff_position = nullif(trim(coalesce(p_staff_position, '')), ''),
    is_ceo = coalesce(p_is_ceo, false),
    can_manage_work_groups = coalesce(p_can_manage_work_groups, true)
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.promote_to_staff(uuid, text, boolean, boolean) from public;
grant execute on function public.promote_to_staff(uuid, text, boolean, boolean) to authenticated, service_role;

create or replace function public.update_staff_profile(
  p_user_id uuid,
  p_full_name text default null,
  p_staff_position text default null,
  p_is_ceo boolean default null,
  p_can_manage_work_groups boolean default null
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_actor public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'not_staff' using errcode = 'P0001';
  end if;

  if p_is_ceo is not null and p_is_ceo is distinct from v_user.is_ceo then
    if not coalesce(v_actor.is_ceo, false) then
      raise exception 'only_ceo_can_change_ceo_flag' using errcode = 'P0001';
    end if;
    if v_user.id = v_actor.id and p_is_ceo is false then
      -- prevent removing last CEO accidentally: allow only if another CEO exists
      if not exists (
        select 1 from public.users u
        where u.role = 'admin'
          and u.is_ceo is true
          and u.status is distinct from 'blocked'
          and u.id <> v_user.id
      ) then
        raise exception 'cannot_remove_last_ceo' using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.users
  set
    full_name = case
      when p_full_name is null then full_name
      else nullif(trim(p_full_name), '')
    end,
    staff_position = case
      when p_staff_position is null then staff_position
      else nullif(trim(p_staff_position), '')
    end,
    is_ceo = coalesce(p_is_ceo, is_ceo),
    can_manage_work_groups = coalesce(p_can_manage_work_groups, can_manage_work_groups)
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.update_staff_profile(uuid, text, text, boolean, boolean) from public;
grant execute on function public.update_staff_profile(uuid, text, text, boolean, boolean) to authenticated, service_role;

create or replace function public.set_staff_status(
  p_user_id uuid,
  p_status public.user_status
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
begin
  if not public.is_ceo() then
    raise exception 'only_ceo_can_block_staff' using errcode = '42501';
  end if;

  if p_status not in ('confirmed', 'blocked') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_staff_status' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'not_staff' using errcode = 'P0001';
  end if;

  if coalesce(v_user.is_ceo, false) and p_status = 'blocked' then
    raise exception 'cannot_block_ceo' using errcode = 'P0001';
  end if;

  update public.users
  set status = p_status
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.set_staff_status(uuid, public.user_status) from public;
grant execute on function public.set_staff_status(uuid, public.user_status) to authenticated, service_role;

-- =============================================================================
-- 5) Poll access hint for cabinet empty state
-- =============================================================================

create or replace function public.get_cabinet_poll_access_hint()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_company public.companies;
  v_active_total int;
  v_matching int;
begin
  select * into v_user from public.users where id = auth.uid();
  if not found or v_user.role <> 'member' then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if v_user.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  if v_user.representative_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_representative');
  end if;

  select c.* into v_company
  from public.representatives r
  join public.companies c on c.id = r.company_id
  where r.id = v_user.representative_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_company');
  end if;

  if v_company.access_status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'company_inactive',
      'company_name', v_company.name,
      'access_status', v_company.access_status
    );
  end if;

  if v_company.participation_level_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_level',
      'company_name', v_company.name
    );
  end if;

  select count(*)::int into v_active_total
  from public.polls p
  where p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at >= now());

  select count(*)::int into v_matching
  from public.polls p
  join public.poll_level_access pla on pla.poll_id = p.id
  where p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at >= now())
    and pla.participation_level_id = v_company.participation_level_id;

  if v_matching > 0 then
    return jsonb_build_object(
      'ok', true,
      'reason', 'ok',
      'matching_count', v_matching,
      'active_total', v_active_total
    );
  end if;

  if v_active_total = 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_active_polls',
      'active_total', 0,
      'matching_count', 0
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'reason', 'level_mismatch',
    'active_total', v_active_total,
    'matching_count', 0,
    'company_name', v_company.name
  );
end;
$$;

revoke all on function public.get_cabinet_poll_access_hint() from public;
grant execute on function public.get_cabinet_poll_access_hint() to authenticated, service_role;

-- Bootstrap: first existing admin becomes CEO if none flagged yet
update public.users u
set is_ceo = true
where u.id = (
  select id
  from public.users
  where role = 'admin'
  order by created_at asc nulls last, email
  limit 1
)
and not exists (
  select 1 from public.users where role = 'admin' and is_ceo is true
);

-- =============================================================================
-- END 20260715000021_cabinet_directory_staff.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000022_company_import_work_group_categories.sql
-- =============================================================================

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

-- =============================================================================
-- END 20260715000022_company_import_work_group_categories.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000023_assign_member_to_company.sql
-- =============================================================================

-- Assign an existing member (user account) to a company as representative.
-- Moves their linked representative or creates one and links users.representative_id.

create or replace function public.list_member_assign_candidates(
  p_company_id uuid,
  p_search text default null
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status public.user_status,
  representative_id uuid,
  current_company_id uuid,
  current_company_name text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_term text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    u.id as user_id,
    u.email,
    u.full_name,
    u.status,
    r.id as representative_id,
    r.company_id as current_company_id,
    c.name as current_company_name
  from public.users u
  left join public.representatives r on r.id = u.representative_id
  left join public.companies c on c.id = r.company_id
  where u.role = 'member'
    and (r.company_id is null or r.company_id <> p_company_id)
    and (
      v_term is null
      or u.email ilike '%' || v_term || '%'
      or coalesce(u.full_name, '') ilike '%' || v_term || '%'
      or coalesce(r.full_name, '') ilike '%' || v_term || '%'
    )
  order by coalesce(u.full_name, u.email)
  limit 80;
end;
$$;

revoke all on function public.list_member_assign_candidates(uuid, text) from public;
grant execute on function public.list_member_assign_candidates(uuid, text) to authenticated, service_role;

create or replace function public.assign_member_to_company(
  p_user_id uuid,
  p_company_id uuid,
  p_is_primary boolean default false,
  p_position text default null
)
returns public.representatives
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep public.representatives;
  v_make_primary boolean := coalesce(p_is_primary, false);
  v_position text := nullif(trim(coalesce(p_position, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'Можно назначить только участника (не сотрудника АПСС)' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' then
    raise exception 'Пользователь заблокирован' using errcode = 'P0001';
  end if;

  if v_user.representative_id is not null then
    select * into v_rep
    from public.representatives
    where id = v_user.representative_id
    for update;

    if not found then
      -- Orphan link: recreate
      update public.users set representative_id = null where id = v_user.id;
      v_user.representative_id := null;
    elsif v_rep.company_id = p_company_id then
      raise exception 'Пользователь уже привязан к этой компании' using errcode = 'P0001';
    else
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = false,
        is_active = true,
        position = coalesce(v_position, position),
        full_name = coalesce(nullif(trim(coalesce(v_user.full_name, '')), ''), full_name),
        email = coalesce(nullif(lower(trim(v_user.email)), ''), email)
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_user.representative_id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(nullif(trim(coalesce(v_user.full_name, '')), ''), split_part(v_user.email, '@', 1)),
      v_position,
      null,
      lower(trim(v_user.email)),
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;

    update public.users
    set representative_id = v_rep.id
    where id = v_user.id;
  end if;

  -- Ensure membership is usable in cabinet
  if v_user.status is distinct from 'confirmed' then
    update public.users
    set status = 'confirmed'
    where id = v_user.id
      and status <> 'blocked';
  end if;

  if v_make_primary and v_rep.is_active then
    return public.set_primary_representative(v_rep.id);
  end if;

  return v_rep;
end;
$$;

revoke all on function public.assign_member_to_company(uuid, uuid, boolean, text) from public;
grant execute on function public.assign_member_to_company(uuid, uuid, boolean, text) to authenticated, service_role;

-- =============================================================================
-- END 20260715000023_assign_member_to_company.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000024_work_group_category_admin_rpcs.sql
-- =============================================================================

-- Admin RPCs for work group categories (directions): usage, safe delete, reorder.

create or replace function public.get_work_group_category_usage(p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_groups integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_work_groups
  from public.work_groups
  where category_id = p_category_id;

  return jsonb_build_object(
    'work_groups', v_work_groups,
    'total', v_work_groups
  );
end;
$$;

create or replace function public.delete_work_group_category(p_category_id uuid)
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

  if not exists (select 1 from public.work_group_categories where id = p_category_id) then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  v_usage := public.get_work_group_category_usage(p_category_id);
  v_total := coalesce((v_usage->>'total')::integer, 0);

  if v_total > 0 then
    raise exception 'category_in_use:%', v_usage::text using errcode = 'P0001';
  end if;

  delete from public.work_group_categories where id = p_category_id;
end;
$$;

create or replace function public.reorder_work_group_categories(p_ordered_ids uuid[])
returns setof public.work_group_categories
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
    update public.work_group_categories
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.work_group_categories
    order by sort_order asc, name asc;
end;
$$;

revoke all on function public.get_work_group_category_usage(uuid) from public;
revoke all on function public.delete_work_group_category(uuid) from public;
revoke all on function public.reorder_work_group_categories(uuid[]) from public;

grant execute on function public.get_work_group_category_usage(uuid) to authenticated, service_role;
grant execute on function public.delete_work_group_category(uuid) to authenticated, service_role;
grant execute on function public.reorder_work_group_categories(uuid[]) to authenticated, service_role;

-- =============================================================================
-- END 20260715000024_work_group_category_admin_rpcs.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000025_show_contacts_to_members.sql
-- =============================================================================

-- Contact visibility preference: show phone/email to other members in the directory.

alter table public.users
  add column if not exists show_contacts_to_members boolean not null default false;

comment on column public.users.show_contacts_to_members is
  'Preference from registration: whether other members may see this user''s contacts in the directory.';

alter table public.representatives
  add column if not exists show_contacts_to_members boolean not null default true;

comment on column public.representatives.show_contacts_to_members is
  'When false, phone/email are hidden from other members in list_association_directory.';

-- Existing representatives keep current behaviour (contacts visible).
update public.representatives
set show_contacts_to_members = true
where show_contacts_to_members is distinct from true;

-- =============================================================================
-- handle_new_user: store preference from auth metadata
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    company_inn_hint,
    pd_consent_at,
    show_contacts_to_members
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end,
    coalesce((new.raw_user_meta_data->>'show_contacts_to_members')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =============================================================================
-- confirm_registration: copy preference onto new / linked representative
-- =============================================================================

create or replace function public.confirm_registration(
  p_user_id uuid,
  p_representative_id uuid default null,
  p_create_representative jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_rep_id uuid;
  v_company_id uuid;
  v_existing_link uuid;
  v_company_inn text;
  v_show_contacts boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' and v_user.representative_id is not null then
    raise exception 'use_set_user_status_to_unblock' using errcode = 'P0001';
  end if;

  if p_representative_id is not null and p_create_representative is not null then
    raise exception 'provide_either_existing_or_create' using errcode = 'P0001';
  end if;

  if p_representative_id is null and p_create_representative is null then
    raise exception 'representative_required' using errcode = 'P0001';
  end if;

  v_show_contacts := coalesce(
    case
      when p_create_representative is not null
           and p_create_representative ? 'show_contacts_to_members'
        then (p_create_representative->>'show_contacts_to_members')::boolean
      else null
    end,
    v_user.show_contacts_to_members,
    false
  );

  if p_representative_id is not null then
    if not exists (select 1 from public.representatives r where r.id = p_representative_id and r.is_active) then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;

    select u.id into v_existing_link
    from public.users u
    where u.representative_id = p_representative_id
      and u.id <> p_user_id
    limit 1;

    if v_existing_link is not null then
      raise exception 'representative_already_linked' using errcode = 'P0001';
    end if;

    v_rep_id := p_representative_id;

    update public.representatives
    set show_contacts_to_members = v_user.show_contacts_to_members
    where id = v_rep_id;
  else
    if p_create_representative ? 'company_id'
       and nullif(p_create_representative->>'company_id', '') is not null then
      v_company_id := (p_create_representative->>'company_id')::uuid;
      if not exists (select 1 from public.companies c where c.id = v_company_id) then
        raise exception 'company_not_found' using errcode = 'P0002';
      end if;
    else
      if nullif(p_create_representative->>'company_name', '') is null then
        raise exception 'company_required' using errcode = 'P0001';
      end if;

      v_company_inn := nullif(regexp_replace(
        coalesce(p_create_representative->>'company_inn', ''),
        '\D',
        '',
        'g'
      ), '');

      if v_company_inn is not null
         and v_company_inn !~ '^\d{10}(\d{2})?$' then
        raise exception 'invalid_company_inn' using errcode = 'P0001';
      end if;

      insert into public.companies (name, inn, access_status)
      values (
        trim(p_create_representative->>'company_name'),
        v_company_inn,
        'active'
      )
      returning id into v_company_id;
    end if;

    if nullif(p_create_representative->>'full_name', '') is null then
      raise exception 'representative_full_name_required' using errcode = 'P0001';
    end if;

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active,
      show_contacts_to_members
    )
    values (
      v_company_id,
      trim(p_create_representative->>'full_name'),
      nullif(trim(p_create_representative->>'position'), ''),
      nullif(trim(p_create_representative->>'phone'), ''),
      nullif(lower(trim(p_create_representative->>'email')), ''),
      coalesce((p_create_representative->>'pd_consent')::boolean, true),
      case
        when coalesce((p_create_representative->>'pd_consent')::boolean, true)
          then coalesce(v_user.pd_consent_at, now())
        else null
      end,
      coalesce((p_create_representative->>'is_primary')::boolean, true),
      true,
      v_show_contacts
    )
    returning id into v_rep_id;
  end if;

  update public.users
  set
    status = 'confirmed',
    representative_id = v_rep_id,
    full_name = coalesce(nullif(trim(full_name), ''), (
      select r.full_name from public.representatives r where r.id = v_rep_id
    ))
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

-- =============================================================================
-- assign_member_to_company: copy preference when creating a representative
-- =============================================================================

create or replace function public.assign_member_to_company(
  p_user_id uuid,
  p_company_id uuid,
  p_is_primary boolean default false,
  p_position text default null
)
returns public.representatives
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep public.representatives;
  v_make_primary boolean := coalesce(p_is_primary, false);
  v_position text := nullif(trim(coalesce(p_position, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'Можно назначить только участника (не сотрудника АПСС)' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' then
    raise exception 'Пользователь заблокирован' using errcode = 'P0001';
  end if;

  if v_user.representative_id is not null then
    select * into v_rep
    from public.representatives
    where id = v_user.representative_id
    for update;

    if not found then
      update public.users set representative_id = null where id = v_user.id;
      v_user.representative_id := null;
    elsif v_rep.company_id = p_company_id then
      raise exception 'Пользователь уже привязан к этой компании' using errcode = 'P0001';
    else
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = false,
        is_active = true,
        position = coalesce(v_position, position),
        full_name = coalesce(nullif(trim(coalesce(v_user.full_name, '')), ''), full_name),
        email = coalesce(nullif(lower(trim(v_user.email)), ''), email),
        show_contacts_to_members = v_user.show_contacts_to_members
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_user.representative_id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active,
      show_contacts_to_members
    )
    values (
      p_company_id,
      coalesce(nullif(trim(coalesce(v_user.full_name, '')), ''), split_part(v_user.email, '@', 1)),
      v_position,
      null,
      lower(trim(v_user.email)),
      true,
      now(),
      false,
      true,
      v_user.show_contacts_to_members
    )
    returning * into v_rep;

    update public.users
    set representative_id = v_rep.id
    where id = v_user.id;
  end if;

  if v_user.status is distinct from 'confirmed' then
    update public.users
    set status = 'confirmed'
    where id = v_user.id
      and status <> 'blocked';
  end if;

  if v_make_primary and v_rep.is_active then
    return public.set_primary_representative(v_rep.id);
  end if;

  return v_rep;
end;
$$;

-- =============================================================================
-- Directory: hide phone/email when preference is off (admins and self still see)
-- =============================================================================

create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.phone
              else null
            end,
            'email', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.email
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000025_show_contacts_to_members.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000026_material_categories.sql
-- =============================================================================

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

-- =============================================================================
-- END 20260715000026_material_categories.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000027_company_products.sql
-- =============================================================================

-- Company products (name + URL, sortable) + directory exposure.

create table if not exists public.company_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_products_name_not_blank check (btrim(name) <> '')
);

create index if not exists company_products_company_sort_idx
  on public.company_products (company_id, sort_order, name);

drop trigger if exists company_products_set_updated_at on public.company_products;
create trigger company_products_set_updated_at
before update on public.company_products
for each row execute function public.set_updated_at();

alter table public.company_products enable row level security;

drop policy if exists company_products_admin_all on public.company_products;
create policy company_products_admin_all
on public.company_products for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_products_select_own_member on public.company_products;
create policy company_products_select_own_member
on public.company_products for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

drop policy if exists company_products_insert_own_member on public.company_products;
create policy company_products_insert_own_member
on public.company_products for insert to authenticated
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

drop policy if exists company_products_update_own_member on public.company_products;
create policy company_products_update_own_member
on public.company_products for update to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
)
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

drop policy if exists company_products_delete_own_member on public.company_products;
create policy company_products_delete_own_member
on public.company_products for delete to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

grant select, insert, update, delete on public.company_products to authenticated;

-- Reorder (admin or own company)

create or replace function public.reorder_company_products(
  p_company_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_index integer := 0;
begin
  if not (
    public.is_admin()
    or (
      public.is_confirmed_member()
      and public.current_company_id() = p_company_id
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'company_required' using errcode = 'P0001';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.company_products
    set sort_order = v_index
    where id = v_id
      and company_id = p_company_id;

    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.company_products
    where company_id = p_company_id
    order by sort_order asc, name asc;
end;
$$;

revoke all on function public.reorder_company_products(uuid, uuid[]) from public;
grant execute on function public.reorder_company_products(uuid, uuid[]) to authenticated, service_role;

-- Directory: include active products

create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.phone
              else null
            end,
            'email', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.email
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        where p.company_id = c.id
          and p.is_active is true
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000027_company_products.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000028_messenger_username.sql
-- =============================================================================

-- Personal messenger username (Telegram / Max) on representatives contacts.

alter table public.representatives
  add column if not exists messenger_username text;

comment on column public.representatives.messenger_username is
  'Username in Telegram or Max (without @). Shown in directory when contacts are shared.';

alter table public.users
  add column if not exists messenger_username text;

comment on column public.users.messenger_username is
  'Optional messenger username from registration; copied to representative on confirm.';

-- =============================================================================
-- handle_new_user
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    company_inn_hint,
    pd_consent_at,
    show_contacts_to_members,
    messenger_username
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end,
    coalesce((new.raw_user_meta_data->>'show_contacts_to_members')::boolean, false),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'messenger_username', '')), '@'),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =============================================================================
-- upsert_representative (+ messenger_username)
-- =============================================================================

drop function if exists public.upsert_representative(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean
);

create or replace function public.upsert_representative(
  p_id uuid default null,
  p_company_id uuid default null,
  p_full_name text default null,
  p_position text default null,
  p_phone text default null,
  p_email text default null,
  p_pd_consent boolean default null,
  p_is_primary boolean default null,
  p_is_active boolean default null,
  p_messenger_username text default null
)
returns public.representatives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representatives;
  v_company_id uuid;
  v_make_primary boolean;
  v_messenger text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_messenger := nullif(ltrim(trim(coalesce(p_messenger_username, '')), '@'), '');

  if p_id is null then
    if p_company_id is null or nullif(trim(p_full_name), '') is null then
      raise exception 'company_and_full_name_required' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;

    v_make_primary := coalesce(p_is_primary, false);

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      messenger_username,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      trim(p_full_name),
      nullif(trim(p_position), ''),
      nullif(trim(p_phone), ''),
      nullif(lower(trim(p_email)), ''),
      v_messenger,
      coalesce(p_pd_consent, false),
      case when coalesce(p_pd_consent, false) then now() else null end,
      false,
      coalesce(p_is_active, true)
    )
    returning * into v_rep;

    if v_make_primary then
      return public.set_primary_representative(v_rep.id);
    end if;

    return v_rep;
  end if;

  select * into v_rep
  from public.representatives
  where id = p_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  v_company_id := coalesce(p_company_id, v_rep.company_id);

  if p_company_id is not null and p_company_id <> v_rep.company_id then
    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;
  end if;

  update public.representatives
  set
    company_id = v_company_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    position = case when p_position is null then position else nullif(trim(p_position), '') end,
    phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end,
    email = case when p_email is null then email else nullif(lower(trim(p_email)), '') end,
    messenger_username = case
      when p_messenger_username is null then messenger_username
      else v_messenger
    end,
    pd_consent = coalesce(p_pd_consent, pd_consent),
    pd_consent_date = case
      when p_pd_consent is true and not pd_consent then now()
      when p_pd_consent is false then null
      else pd_consent_date
    end,
    is_active = coalesce(p_is_active, is_active),
    is_primary = case
      when coalesce(p_is_active, is_active) is false then false
      else is_primary
    end
  where id = p_id
  returning * into v_rep;

  if coalesce(p_is_primary, false) and v_rep.is_active then
    return public.set_primary_representative(v_rep.id);
  end if;

  if p_is_primary is false then
    update public.representatives
    set is_primary = false
    where id = p_id
    returning * into v_rep;
  end if;

  return v_rep;
end;
$$;

revoke all on function public.upsert_representative(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text
) from public;
grant execute on function public.upsert_representative(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text
) to authenticated, service_role;

-- =============================================================================
-- confirm_registration: copy messenger_username
-- =============================================================================

create or replace function public.confirm_registration(
  p_user_id uuid,
  p_representative_id uuid default null,
  p_create_representative jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_rep_id uuid;
  v_company_id uuid;
  v_existing_link uuid;
  v_company_inn text;
  v_show_contacts boolean;
  v_messenger text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' and v_user.representative_id is not null then
    raise exception 'use_set_user_status_to_unblock' using errcode = 'P0001';
  end if;

  if p_representative_id is not null and p_create_representative is not null then
    raise exception 'provide_either_existing_or_create' using errcode = 'P0001';
  end if;

  if p_representative_id is null and p_create_representative is null then
    raise exception 'representative_required' using errcode = 'P0001';
  end if;

  v_show_contacts := coalesce(
    case
      when p_create_representative is not null
           and p_create_representative ? 'show_contacts_to_members'
        then (p_create_representative->>'show_contacts_to_members')::boolean
      else null
    end,
    v_user.show_contacts_to_members,
    false
  );

  v_messenger := coalesce(
    nullif(
      ltrim(trim(coalesce(p_create_representative->>'messenger_username', '')), '@'),
      ''
    ),
    v_user.messenger_username
  );

  if p_representative_id is not null then
    if not exists (select 1 from public.representatives r where r.id = p_representative_id and r.is_active) then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;

    select u.id into v_existing_link
    from public.users u
    where u.representative_id = p_representative_id
      and u.id <> p_user_id
    limit 1;

    if v_existing_link is not null then
      raise exception 'representative_already_linked' using errcode = 'P0001';
    end if;

    v_rep_id := p_representative_id;

    update public.representatives
    set
      show_contacts_to_members = v_user.show_contacts_to_members,
      messenger_username = coalesce(messenger_username, v_user.messenger_username)
    where id = v_rep_id;
  else
    if p_create_representative ? 'company_id'
       and nullif(p_create_representative->>'company_id', '') is not null then
      v_company_id := (p_create_representative->>'company_id')::uuid;
      if not exists (select 1 from public.companies c where c.id = v_company_id) then
        raise exception 'company_not_found' using errcode = 'P0002';
      end if;
    else
      if nullif(p_create_representative->>'company_name', '') is null then
        raise exception 'company_required' using errcode = 'P0001';
      end if;

      v_company_inn := nullif(regexp_replace(
        coalesce(p_create_representative->>'company_inn', ''),
        '\D',
        '',
        'g'
      ), '');

      if v_company_inn is not null
         and v_company_inn !~ '^\d{10}(\d{2})?$' then
        raise exception 'invalid_company_inn' using errcode = 'P0001';
      end if;

      insert into public.companies (name, inn, access_status)
      values (
        trim(p_create_representative->>'company_name'),
        v_company_inn,
        'active'
      )
      returning id into v_company_id;
    end if;

    if nullif(p_create_representative->>'full_name', '') is null then
      raise exception 'representative_full_name_required' using errcode = 'P0001';
    end if;

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      messenger_username,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active,
      show_contacts_to_members
    )
    values (
      v_company_id,
      trim(p_create_representative->>'full_name'),
      nullif(trim(p_create_representative->>'position'), ''),
      nullif(trim(p_create_representative->>'phone'), ''),
      nullif(lower(trim(p_create_representative->>'email')), ''),
      v_messenger,
      coalesce((p_create_representative->>'pd_consent')::boolean, true),
      case
        when coalesce((p_create_representative->>'pd_consent')::boolean, true)
          then coalesce(v_user.pd_consent_at, now())
        else null
      end,
      coalesce((p_create_representative->>'is_primary')::boolean, true),
      true,
      v_show_contacts
    )
    returning id into v_rep_id;
  end if;

  update public.users
  set
    status = 'confirmed',
    representative_id = v_rep_id,
    full_name = coalesce(nullif(trim(full_name), ''), (
      select r.full_name from public.representatives r where r.id = v_rep_id
    ))
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

-- =============================================================================
-- Directory: include messenger_username with contact visibility
-- =============================================================================

create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.phone
              else null
            end,
            'email', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.email
              else null
            end,
            'messenger_username', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.messenger_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        where p.company_id = c.id
          and p.is_active is true
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000028_messenger_username.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000029_telegram_max_usernames.sql
-- =============================================================================

-- Split messenger username into Telegram and Max.

alter table public.representatives
  add column if not exists telegram_username text,
  add column if not exists max_username text;

comment on column public.representatives.telegram_username is
  'Telegram username without @. Shown in directory when contacts are shared.';
comment on column public.representatives.max_username is
  'Max username without @. Shown in directory when contacts are shared.';

alter table public.users
  add column if not exists telegram_username text,
  add column if not exists max_username text;

comment on column public.users.telegram_username is
  'Optional Telegram username from registration; copied to representative on confirm.';
comment on column public.users.max_username is
  'Optional Max username from registration; copied to representative on confirm.';

-- Preserve previously entered single username as Telegram when platform was unknown.
update public.representatives
set telegram_username = messenger_username
where messenger_username is not null
  and nullif(btrim(messenger_username), '') is not null
  and telegram_username is null;

update public.users
set telegram_username = messenger_username
where messenger_username is not null
  and nullif(btrim(messenger_username), '') is not null
  and telegram_username is null;

-- =============================================================================
-- handle_new_user
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    company_inn_hint,
    pd_consent_at,
    show_contacts_to_members,
    telegram_username,
    max_username
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end,
    coalesce((new.raw_user_meta_data->>'show_contacts_to_members')::boolean, false),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'telegram_username', '')), '@'),
      ''
    ),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'max_username', '')), '@'),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =============================================================================
-- upsert_representative
-- =============================================================================

drop function if exists public.upsert_representative(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text
);

create or replace function public.upsert_representative(
  p_id uuid default null,
  p_company_id uuid default null,
  p_full_name text default null,
  p_position text default null,
  p_phone text default null,
  p_email text default null,
  p_pd_consent boolean default null,
  p_is_primary boolean default null,
  p_is_active boolean default null,
  p_telegram_username text default null,
  p_max_username text default null
)
returns public.representatives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representatives;
  v_company_id uuid;
  v_make_primary boolean;
  v_telegram text;
  v_max text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_telegram := nullif(ltrim(trim(coalesce(p_telegram_username, '')), '@'), '');
  v_max := nullif(ltrim(trim(coalesce(p_max_username, '')), '@'), '');

  if p_id is null then
    if p_company_id is null or nullif(trim(p_full_name), '') is null then
      raise exception 'company_and_full_name_required' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;

    v_make_primary := coalesce(p_is_primary, false);

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      telegram_username,
      max_username,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      trim(p_full_name),
      nullif(trim(p_position), ''),
      nullif(trim(p_phone), ''),
      nullif(lower(trim(p_email)), ''),
      v_telegram,
      v_max,
      coalesce(p_pd_consent, false),
      case when coalesce(p_pd_consent, false) then now() else null end,
      false,
      coalesce(p_is_active, true)
    )
    returning * into v_rep;

    if v_make_primary then
      return public.set_primary_representative(v_rep.id);
    end if;

    return v_rep;
  end if;

  select * into v_rep
  from public.representatives
  where id = p_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  v_company_id := coalesce(p_company_id, v_rep.company_id);

  if p_company_id is not null and p_company_id <> v_rep.company_id then
    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;
  end if;

  update public.representatives
  set
    company_id = v_company_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    position = case when p_position is null then position else nullif(trim(p_position), '') end,
    phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end,
    email = case when p_email is null then email else nullif(lower(trim(p_email)), '') end,
    telegram_username = case
      when p_telegram_username is null then telegram_username
      else v_telegram
    end,
    max_username = case
      when p_max_username is null then max_username
      else v_max
    end,
    pd_consent = coalesce(p_pd_consent, pd_consent),
    pd_consent_date = case
      when p_pd_consent is true and not pd_consent then now()
      when p_pd_consent is false then null
      else pd_consent_date
    end,
    is_active = coalesce(p_is_active, is_active),
    is_primary = case
      when coalesce(p_is_active, is_active) is false then false
      else is_primary
    end
  where id = p_id
  returning * into v_rep;

  if coalesce(p_is_primary, false) and v_rep.is_active then
    return public.set_primary_representative(v_rep.id);
  end if;

  if p_is_primary is false then
    update public.representatives
    set is_primary = false
    where id = p_id
    returning * into v_rep;
  end if;

  return v_rep;
end;
$$;

revoke all on function public.upsert_representative(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text, text
) from public;
grant execute on function public.upsert_representative(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text, text
) to authenticated, service_role;

-- =============================================================================
-- confirm_registration
-- =============================================================================

create or replace function public.confirm_registration(
  p_user_id uuid,
  p_representative_id uuid default null,
  p_create_representative jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_rep_id uuid;
  v_company_id uuid;
  v_existing_link uuid;
  v_company_inn text;
  v_show_contacts boolean;
  v_telegram text;
  v_max text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' and v_user.representative_id is not null then
    raise exception 'use_set_user_status_to_unblock' using errcode = 'P0001';
  end if;

  if p_representative_id is not null and p_create_representative is not null then
    raise exception 'provide_either_existing_or_create' using errcode = 'P0001';
  end if;

  if p_representative_id is null and p_create_representative is null then
    raise exception 'representative_required' using errcode = 'P0001';
  end if;

  v_show_contacts := coalesce(
    case
      when p_create_representative is not null
           and p_create_representative ? 'show_contacts_to_members'
        then (p_create_representative->>'show_contacts_to_members')::boolean
      else null
    end,
    v_user.show_contacts_to_members,
    false
  );

  v_telegram := coalesce(
    nullif(
      ltrim(trim(coalesce(p_create_representative->>'telegram_username', '')), '@'),
      ''
    ),
    v_user.telegram_username
  );

  v_max := coalesce(
    nullif(
      ltrim(trim(coalesce(p_create_representative->>'max_username', '')), '@'),
      ''
    ),
    v_user.max_username
  );

  if p_representative_id is not null then
    if not exists (select 1 from public.representatives r where r.id = p_representative_id and r.is_active) then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;

    select u.id into v_existing_link
    from public.users u
    where u.representative_id = p_representative_id
      and u.id <> p_user_id
    limit 1;

    if v_existing_link is not null then
      raise exception 'representative_already_linked' using errcode = 'P0001';
    end if;

    v_rep_id := p_representative_id;

    update public.representatives
    set
      show_contacts_to_members = v_user.show_contacts_to_members,
      telegram_username = coalesce(telegram_username, v_user.telegram_username),
      max_username = coalesce(max_username, v_user.max_username)
    where id = v_rep_id;
  else
    if p_create_representative ? 'company_id'
       and nullif(p_create_representative->>'company_id', '') is not null then
      v_company_id := (p_create_representative->>'company_id')::uuid;
      if not exists (select 1 from public.companies c where c.id = v_company_id) then
        raise exception 'company_not_found' using errcode = 'P0002';
      end if;
    else
      if nullif(p_create_representative->>'company_name', '') is null then
        raise exception 'company_required' using errcode = 'P0001';
      end if;

      v_company_inn := nullif(regexp_replace(
        coalesce(p_create_representative->>'company_inn', ''),
        '\D',
        '',
        'g'
      ), '');

      if v_company_inn is not null
         and v_company_inn !~ '^\d{10}(\d{2})?$' then
        raise exception 'invalid_company_inn' using errcode = 'P0001';
      end if;

      insert into public.companies (name, inn, access_status)
      values (
        trim(p_create_representative->>'company_name'),
        v_company_inn,
        'active'
      )
      returning id into v_company_id;
    end if;

    if nullif(p_create_representative->>'full_name', '') is null then
      raise exception 'representative_full_name_required' using errcode = 'P0001';
    end if;

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      telegram_username,
      max_username,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active,
      show_contacts_to_members
    )
    values (
      v_company_id,
      trim(p_create_representative->>'full_name'),
      nullif(trim(p_create_representative->>'position'), ''),
      nullif(trim(p_create_representative->>'phone'), ''),
      nullif(lower(trim(p_create_representative->>'email')), ''),
      v_telegram,
      v_max,
      coalesce((p_create_representative->>'pd_consent')::boolean, true),
      case
        when coalesce((p_create_representative->>'pd_consent')::boolean, true)
          then coalesce(v_user.pd_consent_at, now())
        else null
      end,
      coalesce((p_create_representative->>'is_primary')::boolean, true),
      true,
      v_show_contacts
    )
    returning id into v_rep_id;
  end if;

  update public.users
  set
    status = 'confirmed',
    representative_id = v_rep_id,
    full_name = coalesce(nullif(trim(full_name), ''), (
      select r.full_name from public.representatives r where r.id = v_rep_id
    ))
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

-- =============================================================================
-- Directory
-- =============================================================================

create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.phone
              else null
            end,
            'email', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        where p.company_id = c.id
          and p.is_active is true
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000029_telegram_max_usernames.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000030_messenger_bot_channels.sql
-- =============================================================================

-- Bot channel catalog + richer message content metadata for channel ingest.

do $$ begin
  create type public.messenger_chat_kind as enum (
    'channel',
    'group',
    'supergroup',
    'other',
    'private'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_content_type as enum (
    'text',
    'photo',
    'video',
    'document',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.messenger_bot_channels (
  id uuid primary key default gen_random_uuid(),
  platform public.messenger_platform not null,
  external_chat_id text not null,
  title text,
  username text,
  chat_kind public.messenger_chat_kind not null default 'other',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_chat_id)
);

comment on table public.messenger_bot_channels is
  'Channels/chats where the APSS bot is present; filled by messenger worker from membership events.';

create index if not exists messenger_bot_channels_platform_active_idx
  on public.messenger_bot_channels (platform, is_active);

create index if not exists messenger_bot_channels_kind_idx
  on public.messenger_bot_channels (chat_kind)
  where is_active;

alter table public.messages
  add column if not exists content_type public.message_content_type not null default 'text',
  add column if not exists payload jsonb not null default '{}'::jsonb;

comment on column public.messages.content_type is
  'Primary content kind; media files are not stored — caption/placeholder in text, extras in payload.';

alter table public.messenger_bot_channels enable row level security;

drop policy if exists messenger_bot_channels_admin_all on public.messenger_bot_channels;
create policy messenger_bot_channels_admin_all
on public.messenger_bot_channels for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =============================================================================
-- END 20260715000030_messenger_bot_channels.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000031_messenger_chat_kind_private.sql
-- =============================================================================

-- Allow private (DM) chats in messenger bot catalog.

alter type public.messenger_chat_kind add value if not exists 'private';

-- =============================================================================
-- END 20260715000031_messenger_chat_kind_private.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000032_messenger_connections_multi_chat.sql
-- =============================================================================

-- Allow multiple messenger chats per platform within a work group.

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_id_platform_key;

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_id_platform_chat_id_key;

alter table public.messenger_connections
  add constraint messenger_connections_work_group_platform_chat_unique
  unique (work_group_id, platform, chat_id);

comment on table public.messenger_connections is
  'Telegram / Max chat bindings for a work group — several chats per platform allowed.';

-- =============================================================================
-- END 20260715000032_messenger_connections_multi_chat.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000033_messenger_connections_one_per_platform.sql
-- =============================================================================

-- One messenger chat per platform per work group (revert multi-chat).

-- Keep the earliest binding when duplicates exist.
delete from public.messenger_connections a
using public.messenger_connections b
where a.work_group_id = b.work_group_id
  and a.platform = b.platform
  and a.ctid > b.ctid;

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_platform_chat_unique;

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_id_platform_key;

alter table public.messenger_connections
  add constraint messenger_connections_work_group_id_platform_key
  unique (work_group_id, platform);

comment on table public.messenger_connections is
  'Telegram / Max chat bindings — one chat per platform per work group.';

-- =============================================================================
-- END 20260715000033_messenger_connections_one_per_platform.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000034_messages_realtime.sql
-- =============================================================================

-- Enable Supabase Realtime for chat messages (admin/cabinet live feed).

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'Publication supabase_realtime not found — skip realtime for messages';
end $$;

-- Required for UPDATE/DELETE payloads when REPLICA IDENTITY is FULL (optional but helpful).
alter table public.messages replica identity full;

-- =============================================================================
-- END 20260715000034_messages_realtime.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000035_company_auto_id_balance_comments.sql
-- =============================================================================

-- Companies: sequential auto_id, balance, admin comments.

-- =============================================================================
-- 1) auto_id + balance on companies
-- =============================================================================

alter table public.companies
  add column if not exists auto_id bigint;

alter table public.companies
  add column if not exists balance numeric(14, 2) not null default 0;

create sequence if not exists public.companies_auto_id_seq;

-- Backfill existing rows (stable order by created_at).
do $$
declare
  r record;
begin
  for r in
    select id
    from public.companies
    where auto_id is null
    order by created_at asc, id asc
  loop
    update public.companies
    set auto_id = nextval('public.companies_auto_id_seq')
    where id = r.id;
  end loop;
end $$;

alter table public.companies
  alter column auto_id set default nextval('public.companies_auto_id_seq');

alter table public.companies
  alter column auto_id set not null;

alter sequence public.companies_auto_id_seq owned by public.companies.auto_id;

create unique index if not exists companies_auto_id_unique_idx
  on public.companies (auto_id);

create index if not exists companies_balance_idx
  on public.companies (balance);

comment on column public.companies.auto_id is
  'Human-readable sequential company number (auto-assigned).';

comment on column public.companies.balance is
  'Company balance (admin-managed).';

-- Members must not change auto_id / balance / notes / access / level.
create or replace function public.protect_company_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  new.access_status := old.access_status;
  new.participation_level_id := old.participation_level_id;
  new.notes := old.notes;
  new.balance := old.balance;
  new.auto_id := old.auto_id;
  return new;
end;
$$;

-- =============================================================================
-- 2) company_comments (admin-only)
-- =============================================================================

create table if not exists public.company_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint company_comments_body_not_empty check (char_length(btrim(body)) > 0)
);

create index if not exists company_comments_company_id_created_idx
  on public.company_comments (company_id, created_at desc);

comment on table public.company_comments is
  'Admin comments / notes history for a company.';

alter table public.company_comments enable row level security;

drop policy if exists company_comments_admin_all on public.company_comments;
create policy company_comments_admin_all
on public.company_comments for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.company_comments to authenticated;
grant all on public.company_comments to service_role;

-- =============================================================================
-- END 20260715000035_company_auto_id_balance_comments.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000036_company_auto_id_six_digits.sql
-- =============================================================================

-- Companies: unique 6-digit auto_id (100000–999999).
-- Must disable member-column protect trigger: without auth.uid()/is_admin()
-- it silently reverts auto_id on UPDATE.

alter table public.companies
  drop constraint if exists companies_auto_id_six_digits;

alter table public.companies
  disable trigger companies_protect_member_columns;

-- Phase 1: free unique values (negatives cannot collide with final 6-digit range).
with numbered as (
  select
    id,
    -row_number() over (order by auto_id asc, created_at asc, id asc) as tmp_auto_id
  from public.companies
)
update public.companies c
set auto_id = numbered.tmp_auto_id
from numbered
where c.id = numbered.id;

-- Phase 2: assign sequential 6-digit IDs starting at 100000.
with numbered as (
  select
    id,
    100000 + (row_number() over (order by auto_id desc, created_at asc, id asc) - 1) as new_auto_id
  from public.companies
)
update public.companies c
set auto_id = numbered.new_auto_id
from numbered
where c.id = numbered.id;

alter table public.companies
  enable trigger companies_protect_member_columns;

-- Next nextval() must yield max(auto_id)+1 (or 100000 if empty).
select setval(
  'public.companies_auto_id_seq',
  greatest(
    coalesce((select max(auto_id) from public.companies), 99999),
    99999
  )
);

alter table public.companies
  alter column auto_id set default nextval('public.companies_auto_id_seq');

alter table public.companies
  add constraint companies_auto_id_six_digits
  check (auto_id >= 100000 and auto_id <= 999999);

comment on column public.companies.auto_id is
  'Unique 6-digit company number (100000–999999), auto-assigned.';

-- =============================================================================
-- END 20260715000036_company_auto_id_six_digits.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000037_company_auto_id_random.sql
-- =============================================================================

-- Companies: random unique 6-digit auto_id (100000–999999), not sequential.

create or replace function public.generate_company_auto_id()
returns bigint
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  candidate bigint;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    if attempts > 200 then
      raise exception 'Could not generate unique 6-digit company auto_id';
    end if;

    -- Inclusive range 100000..999999
    candidate := 100000 + floor(random() * 900000)::bigint;

    exit when not exists (
      select 1
      from public.companies c
      where c.auto_id = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_company_auto_id() from public;
grant execute on function public.generate_company_auto_id() to authenticated, service_role;

alter table public.companies
  drop constraint if exists companies_auto_id_six_digits;

-- Protect trigger reverts auto_id when is_admin() is false (migration role).
alter table public.companies
  disable trigger companies_protect_member_columns;

-- Free current values so reassignment cannot collide with unique index.
with numbered as (
  select
    id,
    -row_number() over (order by auto_id asc, created_at asc, id asc) as tmp_auto_id
  from public.companies
)
update public.companies c
set auto_id = numbered.tmp_auto_id
from numbered
where c.id = numbered.id;

-- Assign a random unique 6-digit id to each company.
do $$
declare
  r record;
  candidate bigint;
  attempts integer;
begin
  for r in
    select id
    from public.companies
    order by created_at asc, id asc
  loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      if attempts > 200 then
        raise exception 'Could not assign unique auto_id for company %', r.id;
      end if;

      candidate := 100000 + floor(random() * 900000)::bigint;

      exit when not exists (
        select 1
        from public.companies c
        where c.auto_id = candidate
      );
    end loop;

    update public.companies
    set auto_id = candidate
    where id = r.id;
  end loop;
end $$;

alter table public.companies
  enable trigger companies_protect_member_columns;

alter table public.companies
  alter column auto_id set default public.generate_company_auto_id();

alter table public.companies
  add constraint companies_auto_id_six_digits
  check (auto_id >= 100000 and auto_id <= 999999);

-- Sequence no longer drives auto_id (keep it; default uses generate_company_auto_id).
do $$
begin
  if to_regclass('public.companies_auto_id_seq') is not null then
    execute 'alter sequence public.companies_auto_id_seq owned by none';
  end if;
end $$;

comment on column public.companies.auto_id is
  'Unique random 6-digit company number (100000–999999), auto-assigned.';

comment on function public.generate_company_auto_id() is
  'Returns a random unused 6-digit company auto_id.';

-- =============================================================================
-- END 20260715000037_company_auto_id_random.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000038_member_self_profile.sql
-- =============================================================================

-- Confirmed members may update a restricted set of their own profile fields.

create or replace function public.update_own_member_profile(
  p_full_name text,
  p_position text default null,
  p_phone text default null,
  p_telegram_username text default null,
  p_max_username text default null,
  p_show_contacts_to_members boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_full_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_telegram text := nullif(ltrim(trim(coalesce(p_telegram_username, '')), '@'), '');
  v_max text := nullif(ltrim(trim(coalesce(p_max_username, '')), '@'), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_full_name is null then
    raise exception 'full_name_required' using errcode = 'P0001';
  end if;

  select * into v_user
  from public.users
  where id = auth.uid()
  for update;

  if not found
     or v_user.role <> 'member'
     or v_user.status <> 'confirmed'
     or v_user.representative_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.representatives
  set
    full_name = v_full_name,
    position = v_position,
    phone = v_phone,
    telegram_username = v_telegram,
    max_username = v_max,
    show_contacts_to_members = coalesce(p_show_contacts_to_members, false)
  where id = v_user.representative_id
    and is_active is true;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  update public.users
  set
    full_name = v_full_name,
    phone = v_phone,
    telegram_username = v_telegram,
    max_username = v_max,
    show_contacts_to_members = coalesce(p_show_contacts_to_members, false)
  where id = auth.uid()
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.update_own_member_profile(
  text, text, text, text, text, boolean
) from public;

grant execute on function public.update_own_member_profile(
  text, text, text, text, text, boolean
) to authenticated;

-- =============================================================================
-- END 20260715000038_member_self_profile.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000039_product_categories.sql
-- =============================================================================

-- Product category dictionary and member-proposed category moderation.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_category_suggestion_status') then
    create type public.product_category_suggestion_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_categories_name_not_blank check (btrim(name) <> ''),
  constraint product_categories_name_key unique (name),
  constraint product_categories_slug_key unique (slug)
);

alter table public.company_products
  add column if not exists category_id uuid
  references public.product_categories (id) on delete set null;

create table if not exists public.product_category_suggestions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.company_products (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  suggested_by uuid not null references public.users (id) on delete cascade,
  suggested_name text not null,
  status public.product_category_suggestion_status not null default 'pending',
  matched_category_id uuid references public.product_categories (id) on delete set null,
  review_note text,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint product_category_suggestions_name_not_blank check (btrim(suggested_name) <> '')
);

create index if not exists product_categories_order_idx
  on public.product_categories (sort_order, name);
create index if not exists company_products_category_idx
  on public.company_products (category_id);
create index if not exists product_category_suggestions_status_idx
  on public.product_category_suggestions (status, created_at desc);
create unique index if not exists product_category_suggestions_product_pending_idx
  on public.product_category_suggestions (product_id)
  where status = 'pending';

alter table public.product_categories enable row level security;
alter table public.product_category_suggestions enable row level security;

drop policy if exists product_categories_admin_all on public.product_categories;
create policy product_categories_admin_all
on public.product_categories for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_categories_select_authenticated on public.product_categories;
create policy product_categories_select_authenticated
on public.product_categories for select to authenticated
using (public.is_admin() or is_active is true);

drop policy if exists product_category_suggestions_admin_all
  on public.product_category_suggestions;
create policy product_category_suggestions_admin_all
on public.product_category_suggestions for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_category_suggestions_member_read
  on public.product_category_suggestions;
create policy product_category_suggestions_member_read
on public.product_category_suggestions for select to authenticated
using (
  suggested_by = auth.uid()
  and company_id = public.current_company_id()
);

create or replace function public.propose_product_category(
  p_product_id uuid,
  p_name text
)
returns public.product_category_suggestions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
  v_suggestion public.product_category_suggestions;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not public.is_confirmed_member() or v_name is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
    and company_id = public.current_company_id()
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.product_categories c
    where lower(btrim(c.name)) = lower(v_name)
  ) then
    raise exception 'category_already_exists' using errcode = '23505';
  end if;

  update public.product_category_suggestions
  set
    status = 'rejected',
    review_note = 'Заменено новой заявкой',
    reviewed_at = now()
  where product_id = p_product_id
    and status = 'pending';

  insert into public.product_category_suggestions (
    product_id,
    company_id,
    suggested_by,
    suggested_name
  )
  values (
    p_product_id,
    v_product.company_id,
    auth.uid(),
    v_name
  )
  returning * into v_suggestion;

  update public.company_products
  set category_id = null
  where id = p_product_id;

  return v_suggestion;
end;
$$;

create or replace function public.review_product_category_suggestion(
  p_suggestion_id uuid,
  p_approve boolean,
  p_category_id uuid default null,
  p_note text default null
)
returns public.product_category_suggestions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_suggestion public.product_category_suggestions;
  v_category_id uuid := p_category_id;
  v_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_suggestion
  from public.product_category_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'suggestion_not_found' using errcode = 'P0002';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'suggestion_already_reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_category_id is null then
      select id into v_category_id
      from public.product_categories
      where lower(btrim(name)) = lower(btrim(v_suggestion.suggested_name))
      limit 1;

      if v_category_id is null then
        select coalesce(max(sort_order), -1) + 1
        into v_sort_order
        from public.product_categories;

        insert into public.product_categories (name, slug, sort_order)
        values (
          btrim(v_suggestion.suggested_name),
          'suggested-' || substr(md5(lower(btrim(v_suggestion.suggested_name))), 1, 16),
          v_sort_order
        )
        returning id into v_category_id;
      end if;
    elsif not exists (
      select 1 from public.product_categories where id = v_category_id
    ) then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    update public.company_products
    set category_id = v_category_id
    where id = v_suggestion.product_id;
  end if;

  update public.product_category_suggestions
  set
    status = case
      when p_approve then 'approved'::public.product_category_suggestion_status
      else 'rejected'::public.product_category_suggestion_status
    end,
    matched_category_id = case when p_approve then v_category_id else null end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_suggestion_id
  returning * into v_suggestion;

  return v_suggestion;
end;
$$;

create or replace function public.get_product_category_usage(p_category_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'products', count(*),
    'total', count(*)
  )
  from public.company_products
  where category_id = p_category_id;
$$;

create or replace function public.delete_product_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.company_products where category_id = p_category_id
  ) then
    raise exception 'category_in_use' using errcode = 'P0001';
  end if;

  delete from public.product_categories where id = p_category_id;
end;
$$;

create or replace function public.reorder_product_categories(p_ordered_ids uuid[])
returns setof public.product_categories
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.product_categories c
  set sort_order = ordered.ordinality - 1
  from unnest(p_ordered_ids) with ordinality as ordered(id, ordinality)
  where c.id = ordered.id;

  return query
  select *
  from public.product_categories
  order by sort_order, name;
end;
$$;

revoke all on function public.propose_product_category(uuid, text) from public;
revoke all on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  from public;
revoke all on function public.get_product_category_usage(uuid) from public;
revoke all on function public.delete_product_category(uuid) from public;
revoke all on function public.reorder_product_categories(uuid[]) from public;

grant execute on function public.propose_product_category(uuid, text) to authenticated;
grant execute on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  to authenticated;
grant execute on function public.get_product_category_usage(uuid) to authenticated;
grant execute on function public.delete_product_category(uuid) to authenticated;
grant execute on function public.reorder_product_categories(uuid[]) to authenticated;

-- Include the approved category in the member directory product payload.
create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.phone
              else null
            end,
            'email', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order,
            'category_id', p.category_id,
            'category_name', pc.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
        where p.company_id = c.id
          and p.is_active is true
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000039_product_categories.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000040_product_moderation.sql
-- =============================================================================

-- Product moderation status + grants for product category tables.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_moderation_status') then
    create type public.product_moderation_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

alter table public.company_products
  add column if not exists moderation_status public.product_moderation_status
    not null default 'pending',
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- Keep already published products visible in the directory.
update public.company_products
set moderation_status = 'approved'
where moderation_status is distinct from 'approved';

create index if not exists company_products_moderation_status_idx
  on public.company_products (moderation_status, created_at desc);

-- Members must not self-approve products.
create or replace function public.protect_company_product_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.review_note := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if
    new.name is distinct from old.name
    or new.url is distinct from old.url
    or new.category_id is distinct from old.category_id
    or new.is_active is distinct from old.is_active
  then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  else
    new.moderation_status := old.moderation_status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

drop trigger if exists company_products_protect_moderation on public.company_products;
create trigger company_products_protect_moderation
before insert or update on public.company_products
for each row execute function public.protect_company_product_moderation();

create or replace function public.review_company_product(
  p_product_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  update public.company_products
  set
    moderation_status = case when p_approve then 'approved'::public.product_moderation_status
      else 'rejected'::public.product_moderation_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_product_id
  returning * into v_product;

  return v_product;
end;
$$;

revoke all on function public.review_company_product(uuid, boolean, text) from public;
grant execute on function public.review_company_product(uuid, boolean, text) to authenticated;

-- Missing grants from 000039 (parity with other dictionaries).
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.product_category_suggestions to authenticated;

-- Directory: only approved products.
create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.phone
              else null
            end,
            'email', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order,
            'category_id', p.category_id,
            'category_name', pc.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
        where p.company_id = c.id
          and p.is_active is true
          and p.moderation_status = 'approved'
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000040_product_moderation.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000041_material_moderation.sql
-- =============================================================================

-- Material release moderation + material category approval gate.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'material_moderation_status') then
    create type public.material_moderation_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- material_sections
-- ---------------------------------------------------------------------------

alter table public.material_sections
  add column if not exists moderation_status public.material_moderation_status
    not null default 'pending',
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- Keep already published materials visible in the cabinet.
update public.material_sections
set
  moderation_status = 'approved',
  reviewed_at = coalesce(reviewed_at, now())
where is_published is true
  and moderation_status is distinct from 'approved';

-- Unpublished drafts stay ready for submit (not in the queue).
update public.material_sections
set moderation_status = 'approved'
where is_published is false
  and moderation_status is distinct from 'approved'
  and reviewed_at is null
  and review_note is null;

create index if not exists material_sections_moderation_status_idx
  on public.material_sections (moderation_status, updated_at desc);

create or replace function public.protect_material_section_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_changed boolean;
  v_is_review_update boolean;
begin
  if tg_op = 'INSERT' then
    if new.is_published then
      -- Publish-on-create becomes a release request.
      new.moderation_status := 'pending';
      new.is_published := false;
    else
      new.moderation_status := 'approved';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  v_is_review_update :=
    public.is_admin()
    and new.moderation_status is distinct from old.moderation_status
    and new.reviewed_by is not null
    and new.reviewed_at is not null;

  if v_is_review_update then
    return new;
  end if;

  v_content_changed :=
    new.title is distinct from old.title
    or new.slug is distinct from old.slug
    or new.description is distinct from old.description
    or new.content is distinct from old.content
    or new.category_id is distinct from old.category_id;

  -- Content change on a live material → pull from cabinet and re-queue.
  if v_content_changed and old.is_published then
    new.moderation_status := 'pending';
    new.is_published := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Publish / re-publish attempt → release request instead of immediate publish.
  if new.is_published is true and old.is_published is false then
    new.moderation_status := 'pending';
    new.is_published := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Preserve review metadata for ordinary edits.
  new.moderation_status := old.moderation_status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  return new;
end;
$$;

drop trigger if exists material_sections_protect_moderation on public.material_sections;
create trigger material_sections_protect_moderation
before insert or update on public.material_sections
for each row execute function public.protect_material_section_moderation();

create or replace function public.review_material_section(
  p_section_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.material_sections
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_section public.material_sections;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_section
  from public.material_sections
  where id = p_section_id
  for update;

  if not found then
    raise exception 'material_not_found' using errcode = 'P0002';
  end if;

  update public.material_sections
  set
    moderation_status = case
      when p_approve then 'approved'::public.material_moderation_status
      else 'rejected'::public.material_moderation_status
    end,
    is_published = p_approve,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_section_id
  returning * into v_section;

  return v_section;
end;
$$;

revoke all on function public.review_material_section(uuid, boolean, text) from public;
grant execute on function public.review_material_section(uuid, boolean, text) to authenticated;

-- Members see only approved + published materials.
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
      and s.moderation_status = 'approved'
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
      and c.participation_level_id is not null
      and msl.participation_level_id = c.participation_level_id
  );
$$;

revoke all on function public.member_can_access_material_section(uuid) from public;
grant execute on function public.member_can_access_material_section(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- material_categories
-- ---------------------------------------------------------------------------

alter table public.material_categories
  add column if not exists moderation_status public.material_moderation_status
    not null default 'pending',
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

update public.material_categories
set
  moderation_status = 'approved',
  reviewed_at = coalesce(reviewed_at, now())
where moderation_status is distinct from 'approved';

create index if not exists material_categories_moderation_status_idx
  on public.material_categories (moderation_status, created_at desc);

create or replace function public.protect_material_category_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_review_update boolean;
begin
  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.is_active := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  v_is_review_update :=
    public.is_admin()
    and new.moderation_status is distinct from old.moderation_status
    and new.reviewed_by is not null
    and new.reviewed_at is not null;

  if v_is_review_update then
    return new;
  end if;

  -- Name change of an approved category → new approval request.
  if new.name is distinct from old.name and old.moderation_status = 'approved' then
    new.moderation_status := 'pending';
    new.is_active := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Preserve review metadata for ordinary edits.
  new.moderation_status := old.moderation_status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  -- Cannot activate until approved.
  if new.is_active is true and new.moderation_status is distinct from 'approved' then
    new.is_active := false;
  end if;

  return new;
end;
$$;

drop trigger if exists material_categories_protect_moderation on public.material_categories;
create trigger material_categories_protect_moderation
before insert or update on public.material_categories
for each row execute function public.protect_material_category_moderation();

create or replace function public.review_material_category(
  p_category_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.material_categories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_category public.material_categories;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_category
  from public.material_categories
  where id = p_category_id
  for update;

  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  update public.material_categories
  set
    moderation_status = case
      when p_approve then 'approved'::public.material_moderation_status
      else 'rejected'::public.material_moderation_status
    end,
    is_active = p_approve,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_category_id
  returning * into v_category;

  return v_category;
end;
$$;

revoke all on function public.review_material_category(uuid, boolean, text) from public;
grant execute on function public.review_material_category(uuid, boolean, text) to authenticated;

-- Members/admins: only approved active categories for non-admin reads.
drop policy if exists material_categories_select_authenticated on public.material_categories;
create policy material_categories_select_authenticated
on public.material_categories for select to authenticated
using (
  public.is_admin()
  or (
    is_active is true
    and moderation_status = 'approved'
  )
);

-- =============================================================================
-- END 20260715000041_material_moderation.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000042_invoices.sql
-- =============================================================================

-- Invoices issued by admins for member companies (cabinet «Счета на оплату»).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum (
      'issued',
      'paid'
    );
  end if;
end
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  title text not null,
  amount numeric(14, 2) not null,
  currency text not null default 'RUB',
  status public.invoice_status not null default 'issued',
  due_date date,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  file_url text,
  file_name text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_title_not_blank check (btrim(title) <> ''),
  constraint invoices_number_not_blank check (btrim(number) <> ''),
  constraint invoices_amount_non_negative check (amount >= 0),
  constraint invoices_currency_not_blank check (btrim(currency) <> ''),
  constraint invoices_number_key unique (number)
);

create index if not exists invoices_company_status_idx
  on public.invoices (company_id, status, created_at desc);
create index if not exists invoices_status_due_idx
  on public.invoices (status, due_date);

alter table public.invoices enable row level security;

drop policy if exists invoices_admin_all on public.invoices;
create policy invoices_admin_all
on public.invoices for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read
on public.invoices for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and status in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  )
);

grant select, insert, update, delete on public.invoices to authenticated;

create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_status public.invoice_status
)
returns public.invoices
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_invoice public.invoices;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status not in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  ) then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  update public.invoices
  set
    status = p_status,
    paid_at = case
      when p_status = 'paid'::public.invoice_status then coalesce(paid_at, now())
      else null
    end,
    updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.set_invoice_status(uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

-- Invoice files storage (admin write, company members read own invoices).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists invoices_storage_admin_all on storage.objects;
create policy invoices_storage_admin_all
on storage.objects for all to authenticated
using (
  bucket_id = 'invoices'
  and public.is_admin()
)
with check (
  bucket_id = 'invoices'
  and public.is_admin()
);

drop policy if exists invoices_storage_member_read on storage.objects;
create policy invoices_storage_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'invoices'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.invoices i
      where i.file_url = name
        and i.company_id = public.current_company_id()
        and public.is_confirmed_member()
    )
  )
);

-- =============================================================================
-- END 20260715000042_invoices.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000043_invoices_fields.sql
-- =============================================================================

-- Align invoices with final fields if 000042 was applied earlier.

alter table public.invoices
  add column if not exists file_url text,
  add column if not exists file_name text;

-- Drop unused description if present.
alter table public.invoices
  drop column if exists description;

-- Ensure issued_at is always set.
update public.invoices
set issued_at = coalesce(issued_at, created_at, now())
where issued_at is null;

alter table public.invoices
  alter column issued_at set default now();

do $$
begin
  alter table public.invoices alter column issued_at set not null;
exception
  when others then null;
end
$$;

-- Normalize legacy statuses to issued/paid when those enum values still exist.
do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'invoice_status'
      and e.enumlabel = 'draft'
  ) then
    execute $sql$
      update public.invoices
      set status = 'issued'::public.invoice_status
      where status::text in ('draft', 'cancelled')
    $sql$;
  end if;
end
$$;

create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_status public.invoice_status
)
returns public.invoices
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_invoice public.invoices;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status::text not in ('issued', 'paid') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  update public.invoices
  set
    status = p_status,
    paid_at = case
      when p_status::text = 'paid' then coalesce(paid_at, now())
      else null
    end,
    updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.set_invoice_status(uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

-- Drop legacy 3-arg overload / number generator if present.
drop function if exists public.set_invoice_status(uuid, public.invoice_status, text);
drop function if exists public.next_invoice_number();

drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read
on public.invoices for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and status::text in ('issued', 'paid')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists invoices_storage_admin_all on storage.objects;
create policy invoices_storage_admin_all
on storage.objects for all to authenticated
using (
  bucket_id = 'invoices'
  and public.is_admin()
)
with check (
  bucket_id = 'invoices'
  and public.is_admin()
);

drop policy if exists invoices_storage_member_read on storage.objects;
create policy invoices_storage_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'invoices'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.invoices i
      where i.file_url = name
        and i.company_id = public.current_company_id()
        and public.is_confirmed_member()
    )
  )
);

-- =============================================================================
-- END 20260715000043_invoices_fields.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000044_notifications.sql
-- =============================================================================

-- In-app notifications for confirmed member users (cabinet).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'invoice_issued',
      'invoice_paid',
      'product_approved',
      'product_rejected',
      'registration_pending',
      'product_moderation_pending',
      'category_suggestion_pending',
      'material_moderation_pending',
      'material_category_pending',
      'registration_confirmed',
      'work_group_membership_pending'
    );
  end if;
end
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (btrim(title) <> '')
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_member_select on public.notifications;
create policy notifications_member_select
on public.notifications for select to authenticated
using (user_id = auth.uid());

-- Inserts/updates only via SECURITY DEFINER helpers / triggers (no direct client write).
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.notify_company_members(
  p_company_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
  if p_company_id is null then
    return 0;
  end if;

  insert into public.notifications (
    user_id,
    company_id,
    type,
    title,
    body,
    link,
    entity_type,
    entity_id,
    payload
  )
  select
    u.id,
    p_company_id,
    p_type,
    p_title,
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_link, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  from public.users u
  join public.representatives r on r.id = u.representative_id
  where r.company_id = p_company_id
    and u.role = 'member'
    and u.status = 'confirmed';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_company_members(
  uuid, public.notification_type, text, text, text, text, uuid, jsonb
) from public;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row public.notifications;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'notification_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- -----------------------------------------------------------------------------
-- Invoice issued (create)
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status = 'issued'::public.invoice_status then
    perform public.notify_company_members(
      new.company_id,
      'invoice_issued'::public.notification_type,
      'Выставлен новый счёт',
      format(
        'Счёт %s на сумму %s %s. %s',
        new.number,
        trim(to_char(new.amount, 'FM999999999990.00')),
        new.currency,
        new.title
      ),
      '/cabinet/invoices/' || new.id::text,
      'invoices',
      new.id,
      jsonb_build_object(
        'number', new.number,
        'amount', new.amount,
        'currency', new.currency,
        'title', new.title
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify_issued on public.invoices;
create trigger invoices_notify_issued
after insert on public.invoices
for each row
execute function public.trg_notify_invoice_issued();

-- -----------------------------------------------------------------------------
-- Invoice paid (status change)
-- -----------------------------------------------------------------------------

create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_status public.invoice_status
)
returns public.invoices
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_prev public.invoice_status;
  v_invoice public.invoices;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status not in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  ) then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  v_prev := v_invoice.status;

  update public.invoices
  set
    status = p_status,
    paid_at = case
      when p_status = 'paid'::public.invoice_status then coalesce(paid_at, now())
      else null
    end,
    updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  if p_status = 'paid'::public.invoice_status and v_prev is distinct from p_status then
    perform public.notify_company_members(
      v_invoice.company_id,
      'invoice_paid'::public.notification_type,
      'Счёт отмечен как оплаченный',
      format('Счёт %s (%s) отмечен как оплаченный.', v_invoice.number, v_invoice.title),
      '/cabinet/invoices/' || v_invoice.id::text,
      'invoices',
      v_invoice.id,
      jsonb_build_object(
        'number', v_invoice.number,
        'title', v_invoice.title
      )
    );
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.set_invoice_status(uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

-- -----------------------------------------------------------------------------
-- Product moderation result
-- -----------------------------------------------------------------------------

create or replace function public.review_company_product(
  p_product_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  update public.company_products
  set
    moderation_status = case when p_approve then 'approved'::public.product_moderation_status
      else 'rejected'::public.product_moderation_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = v_note
  where id = p_product_id
  returning * into v_product;

  if p_approve then
    perform public.notify_company_members(
      v_product.company_id,
      'product_approved'::public.notification_type,
      'Продукция одобрена',
      format('«%s» опубликована в справочнике ассоциации.', v_product.name),
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name)
    );
  else
    perform public.notify_company_members(
      v_product.company_id,
      'product_rejected'::public.notification_type,
      'Продукция отклонена',
      case
        when v_note is not null then format('«%s»: %s', v_product.name, v_note)
        else format('«%s» не прошла модерацию.', v_product.name)
      end,
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name, 'note', v_note)
    );
  end if;

  return v_product;
end;
$$;

revoke all on function public.review_company_product(uuid, boolean, text) from public;
grant execute on function public.review_company_product(uuid, boolean, text) to authenticated;

-- =============================================================================
-- END 20260715000044_notifications.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000045_mark_notifications_by_types.sql
-- =============================================================================

-- Mark own unread notifications as read by type (used when opening related cabinet tabs).

create or replace function public.mark_notifications_read_by_types(p_types public.notification_type[])
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_types is null or cardinality(p_types) = 0 then
    return 0;
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and type = any (p_types);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read_by_types(public.notification_type[]) from public;
grant execute on function public.mark_notifications_read_by_types(public.notification_type[]) to authenticated;

-- =============================================================================
-- END 20260715000045_mark_notifications_by_types.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000046_email_notifications.sql
-- =============================================================================

-- Email digests for in-app notifications (smtp.bz via Edge Function).

alter table public.users
  add column if not exists email_notifications_enabled boolean not null default true;

comment on column public.users.email_notifications_enabled is
  'When true, duplicate in-app notifications to the user email via smtp.bz.';

-- Runtime config for DB → Edge webhook (set after deploy).
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- No direct client access; only SECURITY DEFINER helpers / service role.
revoke all on table public.app_settings from public, anon, authenticated;

insert into public.app_settings (key, value)
values
  ('notification_email_webhook_url', ''),
  ('notification_email_webhook_secret', '')
on conflict (key) do nothing;

-- =============================================================================
-- handle_new_user — persist registration opt-in
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    company_inn_hint,
    pd_consent_at,
    show_contacts_to_members,
    email_notifications_enabled,
    telegram_username,
    max_username
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end,
    coalesce((new.raw_user_meta_data->>'show_contacts_to_members')::boolean, false),
    coalesce((new.raw_user_meta_data->>'email_notifications_enabled')::boolean, true),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'telegram_username', '')), '@'),
      ''
    ),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'max_username', '')), '@'),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =============================================================================
-- Toggle for confirmed members
-- =============================================================================

create or replace function public.set_own_email_notifications(p_enabled boolean)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.users
  set email_notifications_enabled = coalesce(p_enabled, false)
  where id = auth.uid()
    and role = 'member'
    and status = 'confirmed'
  returning * into v_user;

  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

revoke all on function public.set_own_email_notifications(boolean) from public;
grant execute on function public.set_own_email_notifications(boolean) to authenticated;

-- =============================================================================
-- Dispatch email after notification insert (pg_net → messenger /v1/notification-email)
-- Configure URL in public.app_settings (notification_email_webhook_url).
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.request_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_enabled boolean;
  v_url text;
  v_secret text;
begin
  select u.email_notifications_enabled
  into v_enabled
  from public.users u
  where u.id = new.user_id;

  if coalesce(v_enabled, false) is not true then
    return new;
  end if;

  select nullif(btrim(s.value), '')
  into v_url
  from public.app_settings s
  where s.key = 'notification_email_webhook_url';

  if v_url is null then
    return new;
  end if;

  select coalesce(s.value, '')
  into v_secret
  from public.app_settings s
  where s.key = 'notification_email_webhook_secret';

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apss-webhook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
exception
  when others then
    raise warning 'notification email dispatch failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists notifications_request_email on public.notifications;
create trigger notifications_request_email
after insert on public.notifications
for each row
execute function public.request_notification_email();

-- =============================================================================
-- END 20260715000046_email_notifications.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000047_fix_product_category_suggestion_status_cast.sql
-- =============================================================================

-- CASE without enum casts resolves to text and fails assignment to
-- product_category_suggestion_status (approve/reject suggestion RPC).

create or replace function public.review_product_category_suggestion(
  p_suggestion_id uuid,
  p_approve boolean,
  p_category_id uuid default null,
  p_note text default null
)
returns public.product_category_suggestions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_suggestion public.product_category_suggestions;
  v_category_id uuid := p_category_id;
  v_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_suggestion
  from public.product_category_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'suggestion_not_found' using errcode = 'P0002';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'suggestion_already_reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_category_id is null then
      select id into v_category_id
      from public.product_categories
      where lower(btrim(name)) = lower(btrim(v_suggestion.suggested_name))
      limit 1;

      if v_category_id is null then
        select coalesce(max(sort_order), -1) + 1
        into v_sort_order
        from public.product_categories;

        insert into public.product_categories (name, slug, sort_order)
        values (
          btrim(v_suggestion.suggested_name),
          'suggested-' || substr(md5(lower(btrim(v_suggestion.suggested_name))), 1, 16),
          v_sort_order
        )
        returning id into v_category_id;
      end if;
    elsif not exists (
      select 1 from public.product_categories where id = v_category_id
    ) then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    update public.company_products
    set category_id = v_category_id
    where id = v_suggestion.product_id;
  end if;

  update public.product_category_suggestions
  set
    status = case
      when p_approve then 'approved'::public.product_category_suggestion_status
      else 'rejected'::public.product_category_suggestion_status
    end,
    matched_category_id = case when p_approve then v_category_id else null end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_suggestion_id
  returning * into v_suggestion;

  return v_suggestion;
end;
$$;

revoke all on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  from public;
grant execute on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  to authenticated;

-- =============================================================================
-- END 20260715000047_fix_product_category_suggestion_status_cast.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000048_okpd2_and_product_notes.sql
-- =============================================================================

-- OKPD 2 hierarchy + product notes; wire into company_products and directory.

create table if not exists public.okpd2_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  parent_id uuid references public.okpd2_codes (id) on delete restrict,
  level integer not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint okpd2_codes_code_not_blank check (btrim(code) <> ''),
  constraint okpd2_codes_title_not_blank check (btrim(title) <> ''),
  constraint okpd2_codes_code_key unique (code)
);

create index if not exists okpd2_codes_parent_idx on public.okpd2_codes (parent_id);
create index if not exists okpd2_codes_active_order_idx
  on public.okpd2_codes (is_active, sort_order, code);

create table if not exists public.product_notes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_notes_name_not_blank check (btrim(name) <> ''),
  constraint product_notes_name_key unique (name)
);

create index if not exists product_notes_order_idx
  on public.product_notes (is_active, sort_order, name);

alter table public.company_products
  add column if not exists okpd_code_id uuid
    references public.okpd2_codes (id) on delete set null,
  add column if not exists note_id uuid
    references public.product_notes (id) on delete set null;

create index if not exists company_products_okpd_idx
  on public.company_products (okpd_code_id);
create index if not exists company_products_note_idx
  on public.company_products (note_id);

alter table public.okpd2_codes enable row level security;
alter table public.product_notes enable row level security;

drop policy if exists okpd2_codes_admin_all on public.okpd2_codes;
create policy okpd2_codes_admin_all
on public.okpd2_codes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists okpd2_codes_select_authenticated on public.okpd2_codes;
create policy okpd2_codes_select_authenticated
on public.okpd2_codes for select to authenticated
using (public.is_admin() or is_active is true);

drop policy if exists product_notes_admin_all on public.product_notes;
create policy product_notes_admin_all
on public.product_notes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_notes_select_authenticated on public.product_notes;
create policy product_notes_select_authenticated
on public.product_notes for select to authenticated
using (public.is_admin() or is_active is true);

grant select, insert, update, delete on public.okpd2_codes to authenticated;
grant select, insert, update, delete on public.product_notes to authenticated;

-- Seed notes (idempotent by name).
insert into public.product_notes (name, sort_order)
values
  ('для общеобразовательных учреждений', 0),
  ('для медицинских учреждений', 1),
  ('для утилитарного уличного освещения', 2),
  ('для освещения парков', 3),
  ('взрывозащищённые светильники', 4),
  ('отсутствует', 5)
on conflict (name) do nothing;

-- Seed OKPD 2 lighting branch from spreadsheet (values CTE, no staging table).
insert into public.okpd2_codes (code, title, level, parent_id, sort_order)
select s.code, s.title, s.level, null, s.sort_order
from (
  values
  ('27.40', 'Оборудование электрическое осветительное', 3, null::text, 0),
  ('27.40.1', 'Лампы накаливания или газоразрядные лампы; дуговые лампы; светодиодные лампы', 4, '27.40'::text, 1),
  ('27.40.11', 'Лампы герметичные узконаправленного света', 5, '27.40.1'::text, 2),
  ('27.40.11.000', 'Лампы герметичные узконаправленного света', 6, '27.40.11'::text, 3),
  ('27.40.12', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 5, '27.40.1'::text, 4),
  ('27.40.12.000', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 6, '27.40.12'::text, 5),
  ('27.40.13', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 5, '27.40.1'::text, 6),
  ('27.40.13.000', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 6, '27.40.13'::text, 7),
  ('27.40.14', 'Лампы накаливания прочие, не включенные в другие группировки', 5, '27.40.1'::text, 8),
  ('27.40.14.000', 'Лампы накаливания прочие, не включенные в другие группировки', 6, '27.40.14'::text, 9),
  ('27.40.15', 'Лампы газоразрядные; ультрафиолетовые и инфракрасные лампы; дуговые лампы; светодиодные лампы', 5, '27.40.1'::text, 10),
  ('27.40.15.110', 'Лампы газоразрядные', 6, '27.40.15'::text, 11),
  ('27.40.15.111', 'Лампы ртутные высокого давления', 7, '27.40.15'::text, 12),
  ('27.40.15.112', 'Лампы натриевые высокого давления', 7, '27.40.15'::text, 13),
  ('27.40.15.113', 'Лампы натриевые низкого давления', 7, '27.40.15'::text, 14),
  ('27.40.15.114', 'Лампы люминесцентные', 7, '27.40.15'::text, 15),
  ('27.40.15.115', 'Лампы металлогалогенные', 7, '27.40.15'::text, 16),
  ('27.40.15.119', 'Лампы газоразрядные прочие', 7, '27.40.15'::text, 17),
  ('27.40.15.120', 'Лампы ультрафиолетовые', 6, '27.40.15'::text, 18),
  ('27.40.15.130', 'Лампы инфракрасные', 6, '27.40.15'::text, 19),
  ('27.40.15.140', 'Лампы дуговые', 6, '27.40.15'::text, 20),
  ('27.40.15.150', 'Лампы светодиодны', 6, '27.40.15'::text, 21),
  ('27.40.2', 'Светильники и осветительные устройства', 4, '27.40'::text, 22),
  ('27.40.21', 'Светильники и фонари электрические переносные, работающие от встроенных батарей сухих элементов, аккумуляторов, магнето', 5, '27.40.2'::text, 23),
  ('27.40.21.110', 'Светильники электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 24),
  ('27.40.21.120', 'Фонари электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 25),
  ('27.40.22', 'Светильники электрические настольные, прикроватные или напольные', 5, '27.40.2'::text, 26),
  ('27.40.22.110', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами накаливания', 6, '27.40.22'::text, 27),
  ('27.40.22.120', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.22'::text, 28),
  ('27.40.22.130', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.22'::text, 29),
  ('27.40.22.190', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами прочих типов', 6, '27.40.22'::text, 30),
  ('27.40.24', 'Указатели светящиеся, световые табло и подобные им устройства', 5, '27.40.2'::text, 31),
  ('27.40.24.110', 'Указатели светящиеся', 6, '27.40.24'::text, 32),
  ('27.40.24.111', 'Указатели светящиеся, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 33),
  ('27.40.24.112', 'Указатели светящиеся, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 34),
  ('27.40.24.113', 'Указатели светящиеся, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 35),
  ('27.40.24.119', 'Указатели светящиеся, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 36),
  ('27.40.24.120', 'Табло световые и аналогичные устройства', 6, '27.40.24'::text, 37),
  ('27.40.24.121', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 38),
  ('27.40.24.122', 'Световые табло и аналогичные устройства, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 39),
  ('27.40.24.123', 'Световые табло и аналогичные устройства, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 40),
  ('27.40.24.129', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 41),
  ('27.40.25', 'Люстры и прочие устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные', 5, '27.40.2'::text, 42),
  ('27.40.25.110', 'Люстры', 6, '27.40.25'::text, 43),
  ('27.40.25.111', 'Люстры, предназначенные для использования с лампами накаливания', 7, '27.40.25'::text, 44),
  ('27.40.25.112', 'Люстры, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.25'::text, 45),
  ('27.40.25.113', 'Люстры, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.25'::text, 46),
  ('27.40.25.119', 'Люстры, предназначенные для использования с лампами прочих типов', 7, '27.40.25'::text, 47),
  ('27.40.25.120', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 48),
  ('27.40.25.121', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами накаливания, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 49),
  ('27.40.25.122', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с люминесцентными газоразрядными лампами, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 50),
  ('27.40.25.123', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 51),
  ('27.40.25.129', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами прочих типов, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 52),
  ('27.40.25.130', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 53),
  ('27.40.25.131', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.25'::text, 54),
  ('27.40.25.132', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.25'::text, 55),
  ('27.40.25.139', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.25'::text, 56),
  ('27.40.25.140', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.25'::text, 57),
  ('27.40.25.141', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с лампами накаливания; не предназначенные для иных областей применения', 7, '27.40.25'::text, 58),
  ('27.40.25.142', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.25'::text, 59),
  ('27.40.25.143', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.25'::text, 60),
  ('27.40.25.144', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.25'::text, 61),
  ('27.40.25.145', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя 6ы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.25'::text, 62),
  ('27.40.25.149', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.25'::text, 63),
  ('27.40.3', 'Светильники и осветительные устройства прочие', 4, '27.40'::text, 64),
  ('27.40.31', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 5, '27.40.3'::text, 65),
  ('27.40.31.000', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 6, '27.40.31'::text, 66),
  ('27.40.32', 'Наборы осветительные для рождественских (новогодних) елок', 5, '27.40.3'::text, 67),
  ('27.40.32.000', 'Наборы осветительные для рождественских (новогодних) елок', 6, '27.40.32'::text, 68),
  ('27.40.33', 'Прожекторы и аналогичные светильники узконаправленного света', 5, '27.40.3'::text, 69),
  ('27.40.33.110', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с лампами накаливания', 6, '27.40.33'::text, 70),
  ('27.40.33.120', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.33'::text, 71),
  ('27.40.33.130', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.33'::text, 72),
  ('27.40.33.140', 'Осветители операционные', 6, '27.40.33'::text, 73),
  ('27.40.33.190', 'Прожекторы и аналогичные светильники узконаправленного света с лампами прочих типов', 6, '27.40.33'::text, 74),
  ('27.40.33.210', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.33'::text, 75),
  ('27.40.33.211', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.33'::text, 76),
  ('27.40.33.212', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.33'::text, 77),
  ('27.40.33.213', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.33'::text, 78),
  ('27.40.33.214', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя бы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.33'::text, 79),
  ('27.40.33.219', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.33'::text, 80),
  ('27.40.39', 'Светильники и осветительные устройства прочие, не включенные в другие группировки', 5, '27.40.3'::text, 81),
  ('27.40.39.110', 'Светильники и устройства осветительные прочие, не включенные в другие группировки', 6, '27.40.39'::text, 82),
  ('27.40.39.111', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами накаливания', 7, '27.40.39'::text, 83),
  ('27.40.39.112', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.39'::text, 84),
  ('27.40.39.113', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.39'::text, 85),
  ('27.40.39.119', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами прочих типов', 7, '27.40.39'::text, 86),
  ('27.40.39.190', 'Арматура осветительная прочая, не включенная в другие группировки', 6, '27.40.39'::text, 87),
  ('27.40.39.210', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.39'::text, 88),
  ('27.40.39.211', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с лампами накаливания', 7, '27.40.39'::text, 89),
  ('27.40.39.212', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.39'::text, 90),
  ('27.40.39.213', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с разрядными лампами (кроме люминесцентных ламп)', 7, '27.40.39'::text, 91),
  ('27.40.39.214', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.39'::text, 92),
  ('27.40.39.219', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.39'::text, 93),
  ('27.40.4', 'Части ламп и осветительного оборудования', 4, '27.40'::text, 94),
  ('27.40.41', 'Части ламп накаливания или газоразрядных ламп', 5, '27.40.4'::text, 95),
  ('27.40.41.000', 'Части ламп накаливания или газоразрядных ламп', 6, '27.40.41'::text, 96),
  ('27.40.42', 'Части светильников и осветительных устройств', 5, '27.40.4'::text, 97),
  ('27.40.42.110', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных (включая источники напряжения и источники тока)', 6, '27.40.42'::text, 98),
  ('27.40.42.111', 'Блоки питания электромагнитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 99),
  ('27.40.42.112', 'Блоки питания электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 100),
  ('27.40.42.113', 'Блоки электронные защитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 101),
  ('27.40.42.114', 'Блоки питания программируемые электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 102),
  ('27.40.42.119', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных, прочие', 7, '27.40.42'::text, 103),
  ('27.40.42.200', 'Элементы системы управления освещением', 6, '27.40.42'::text, 104),
  ('27.40.42.210', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые', 6, '27.40.42'::text, 105),
  ('27.40.42.211', 'Беспроводные устройства контроля, регулирования освещения и/или мониторинга осветительных установок и беспроводные контроллеры (модули) управления', 7, '27.40.42'::text, 106),
  ('27.40.42.212', 'Контроллеры, устройства управления, контроля и регулирования освещения и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В (в том числе контроллеры и модули управления нижнего уровня систем управления освещением)', 7, '27.40.42'::text, 107),
  ('27.40.42.213', 'Контроллеры, устройства управления, контроля » и регулирования освещения и мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 108),
  ('27.40.42.219', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые прочие', 7, '27.40.42'::text, 109),
  ('27.40.42.220', 'Датчики (сенсоры) и периферийные устройства систем управления освещением', 6, '27.40.42'::text, 110),
  ('27.40.42.221', 'Бесконтактные инфракрасные датчики присутствия систем управления освещением', 7, '27.40.42'::text, 111),
  ('27.40.42.222', 'Бесконтактные радиоволновые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 112),
  ('27.40.42.223', 'Бесконтактные ультразвуковые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 113),
  ('27.40.42.224', 'Датчики освещенности, спектра, ИК-датчики и прочие датчики освещенности и спектра видимой и ИК-области, в том числе фотометрические, применяемые в системах освещения ИК-датчики, датчики освещенности и спектра могут совмещать в себе функции датчиков и устройств формирования управляющих сигналов для управляемых пускорегулирующих аппаратов с целью изменения параметров искусственного освещения', 7, '27.40.42'::text, 114),
  ('27.40.42.225', 'Преобразователи интерфейсов передачи данных систем управления освещением и периферийные устройства управления, в том числе: переключатели, роторные и сенсорные устройства диммирования (регулирования мощности излучения и/или изменения цветовой температуры)', 7, '27.40.42'::text, 115),
  ('27.40.42.226', 'Мультисенсоры, применяемые в системах освещения', 7, '27.40.42'::text, 116),
  ('27.40.42.229', 'Датчики (сенсоры) и периферийные устройства систем управления освещением прочие', 7, '27.40.42'::text, 117),
  ('27.40.42.230', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением', 6, '27.40.42'::text, 118),
  ('27.40.42.231', 'Беспроводные устройства (контроллеры) группового управления и/или регулирования освещением и мониторинга систем освещения', 7, '27.40.42'::text, 119),
  ('27.40.42.232', 'Контроллеры и устройства группового управления/регулирования и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В', 7, '27.40.42'::text, 120),
  ('27.40.42.233', 'Устройства и контроллеры группового управления (регулирования) освещением и группового мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 121),
  ('27.40.42.239', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением прочие', 7, '27.40.42'::text, 122),
  ('27.40.42.290', 'Части светильников и осветительных устройств прочие', 6, '27.40.42'::text, 123),
  ('27.40.9', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 4, '27.40'::text, 124),
  ('27.40.99', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 5, '27.40.9'::text, 125),
  ('27.40.99.000', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 6, '27.40.99'::text, 126)
) as s(code, title, level, parent_code, sort_order)
on conflict (code) do update
set
  title = excluded.title,
  level = excluded.level,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.okpd2_codes c
set
  parent_id = p.id,
  updated_at = now()
from (
  values
  ('27.40', 'Оборудование электрическое осветительное', 3, null::text, 0),
  ('27.40.1', 'Лампы накаливания или газоразрядные лампы; дуговые лампы; светодиодные лампы', 4, '27.40'::text, 1),
  ('27.40.11', 'Лампы герметичные узконаправленного света', 5, '27.40.1'::text, 2),
  ('27.40.11.000', 'Лампы герметичные узконаправленного света', 6, '27.40.11'::text, 3),
  ('27.40.12', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 5, '27.40.1'::text, 4),
  ('27.40.12.000', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 6, '27.40.12'::text, 5),
  ('27.40.13', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 5, '27.40.1'::text, 6),
  ('27.40.13.000', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 6, '27.40.13'::text, 7),
  ('27.40.14', 'Лампы накаливания прочие, не включенные в другие группировки', 5, '27.40.1'::text, 8),
  ('27.40.14.000', 'Лампы накаливания прочие, не включенные в другие группировки', 6, '27.40.14'::text, 9),
  ('27.40.15', 'Лампы газоразрядные; ультрафиолетовые и инфракрасные лампы; дуговые лампы; светодиодные лампы', 5, '27.40.1'::text, 10),
  ('27.40.15.110', 'Лампы газоразрядные', 6, '27.40.15'::text, 11),
  ('27.40.15.111', 'Лампы ртутные высокого давления', 7, '27.40.15'::text, 12),
  ('27.40.15.112', 'Лампы натриевые высокого давления', 7, '27.40.15'::text, 13),
  ('27.40.15.113', 'Лампы натриевые низкого давления', 7, '27.40.15'::text, 14),
  ('27.40.15.114', 'Лампы люминесцентные', 7, '27.40.15'::text, 15),
  ('27.40.15.115', 'Лампы металлогалогенные', 7, '27.40.15'::text, 16),
  ('27.40.15.119', 'Лампы газоразрядные прочие', 7, '27.40.15'::text, 17),
  ('27.40.15.120', 'Лампы ультрафиолетовые', 6, '27.40.15'::text, 18),
  ('27.40.15.130', 'Лампы инфракрасные', 6, '27.40.15'::text, 19),
  ('27.40.15.140', 'Лампы дуговые', 6, '27.40.15'::text, 20),
  ('27.40.15.150', 'Лампы светодиодны', 6, '27.40.15'::text, 21),
  ('27.40.2', 'Светильники и осветительные устройства', 4, '27.40'::text, 22),
  ('27.40.21', 'Светильники и фонари электрические переносные, работающие от встроенных батарей сухих элементов, аккумуляторов, магнето', 5, '27.40.2'::text, 23),
  ('27.40.21.110', 'Светильники электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 24),
  ('27.40.21.120', 'Фонари электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 25),
  ('27.40.22', 'Светильники электрические настольные, прикроватные или напольные', 5, '27.40.2'::text, 26),
  ('27.40.22.110', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами накаливания', 6, '27.40.22'::text, 27),
  ('27.40.22.120', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.22'::text, 28),
  ('27.40.22.130', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.22'::text, 29),
  ('27.40.22.190', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами прочих типов', 6, '27.40.22'::text, 30),
  ('27.40.24', 'Указатели светящиеся, световые табло и подобные им устройства', 5, '27.40.2'::text, 31),
  ('27.40.24.110', 'Указатели светящиеся', 6, '27.40.24'::text, 32),
  ('27.40.24.111', 'Указатели светящиеся, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 33),
  ('27.40.24.112', 'Указатели светящиеся, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 34),
  ('27.40.24.113', 'Указатели светящиеся, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 35),
  ('27.40.24.119', 'Указатели светящиеся, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 36),
  ('27.40.24.120', 'Табло световые и аналогичные устройства', 6, '27.40.24'::text, 37),
  ('27.40.24.121', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 38),
  ('27.40.24.122', 'Световые табло и аналогичные устройства, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 39),
  ('27.40.24.123', 'Световые табло и аналогичные устройства, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 40),
  ('27.40.24.129', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 41),
  ('27.40.25', 'Люстры и прочие устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные', 5, '27.40.2'::text, 42),
  ('27.40.25.110', 'Люстры', 6, '27.40.25'::text, 43),
  ('27.40.25.111', 'Люстры, предназначенные для использования с лампами накаливания', 7, '27.40.25'::text, 44),
  ('27.40.25.112', 'Люстры, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.25'::text, 45),
  ('27.40.25.113', 'Люстры, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.25'::text, 46),
  ('27.40.25.119', 'Люстры, предназначенные для использования с лампами прочих типов', 7, '27.40.25'::text, 47),
  ('27.40.25.120', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 48),
  ('27.40.25.121', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами накаливания, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 49),
  ('27.40.25.122', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с люминесцентными газоразрядными лампами, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 50),
  ('27.40.25.123', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 51),
  ('27.40.25.129', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами прочих типов, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 52),
  ('27.40.25.130', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 53),
  ('27.40.25.131', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.25'::text, 54),
  ('27.40.25.132', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.25'::text, 55),
  ('27.40.25.139', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.25'::text, 56),
  ('27.40.25.140', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.25'::text, 57),
  ('27.40.25.141', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с лампами накаливания; не предназначенные для иных областей применения', 7, '27.40.25'::text, 58),
  ('27.40.25.142', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.25'::text, 59),
  ('27.40.25.143', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.25'::text, 60),
  ('27.40.25.144', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.25'::text, 61),
  ('27.40.25.145', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя 6ы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.25'::text, 62),
  ('27.40.25.149', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.25'::text, 63),
  ('27.40.3', 'Светильники и осветительные устройства прочие', 4, '27.40'::text, 64),
  ('27.40.31', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 5, '27.40.3'::text, 65),
  ('27.40.31.000', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 6, '27.40.31'::text, 66),
  ('27.40.32', 'Наборы осветительные для рождественских (новогодних) елок', 5, '27.40.3'::text, 67),
  ('27.40.32.000', 'Наборы осветительные для рождественских (новогодних) елок', 6, '27.40.32'::text, 68),
  ('27.40.33', 'Прожекторы и аналогичные светильники узконаправленного света', 5, '27.40.3'::text, 69),
  ('27.40.33.110', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с лампами накаливания', 6, '27.40.33'::text, 70),
  ('27.40.33.120', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.33'::text, 71),
  ('27.40.33.130', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.33'::text, 72),
  ('27.40.33.140', 'Осветители операционные', 6, '27.40.33'::text, 73),
  ('27.40.33.190', 'Прожекторы и аналогичные светильники узконаправленного света с лампами прочих типов', 6, '27.40.33'::text, 74),
  ('27.40.33.210', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.33'::text, 75),
  ('27.40.33.211', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.33'::text, 76),
  ('27.40.33.212', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.33'::text, 77),
  ('27.40.33.213', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.33'::text, 78),
  ('27.40.33.214', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя бы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.33'::text, 79),
  ('27.40.33.219', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.33'::text, 80),
  ('27.40.39', 'Светильники и осветительные устройства прочие, не включенные в другие группировки', 5, '27.40.3'::text, 81),
  ('27.40.39.110', 'Светильники и устройства осветительные прочие, не включенные в другие группировки', 6, '27.40.39'::text, 82),
  ('27.40.39.111', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами накаливания', 7, '27.40.39'::text, 83),
  ('27.40.39.112', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.39'::text, 84),
  ('27.40.39.113', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.39'::text, 85),
  ('27.40.39.119', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами прочих типов', 7, '27.40.39'::text, 86),
  ('27.40.39.190', 'Арматура осветительная прочая, не включенная в другие группировки', 6, '27.40.39'::text, 87),
  ('27.40.39.210', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.39'::text, 88),
  ('27.40.39.211', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с лампами накаливания', 7, '27.40.39'::text, 89),
  ('27.40.39.212', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.39'::text, 90),
  ('27.40.39.213', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с разрядными лампами (кроме люминесцентных ламп)', 7, '27.40.39'::text, 91),
  ('27.40.39.214', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.39'::text, 92),
  ('27.40.39.219', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.39'::text, 93),
  ('27.40.4', 'Части ламп и осветительного оборудования', 4, '27.40'::text, 94),
  ('27.40.41', 'Части ламп накаливания или газоразрядных ламп', 5, '27.40.4'::text, 95),
  ('27.40.41.000', 'Части ламп накаливания или газоразрядных ламп', 6, '27.40.41'::text, 96),
  ('27.40.42', 'Части светильников и осветительных устройств', 5, '27.40.4'::text, 97),
  ('27.40.42.110', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных (включая источники напряжения и источники тока)', 6, '27.40.42'::text, 98),
  ('27.40.42.111', 'Блоки питания электромагнитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 99),
  ('27.40.42.112', 'Блоки питания электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 100),
  ('27.40.42.113', 'Блоки электронные защитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 101),
  ('27.40.42.114', 'Блоки питания программируемые электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 102),
  ('27.40.42.119', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных, прочие', 7, '27.40.42'::text, 103),
  ('27.40.42.200', 'Элементы системы управления освещением', 6, '27.40.42'::text, 104),
  ('27.40.42.210', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые', 6, '27.40.42'::text, 105),
  ('27.40.42.211', 'Беспроводные устройства контроля, регулирования освещения и/или мониторинга осветительных установок и беспроводные контроллеры (модули) управления', 7, '27.40.42'::text, 106),
  ('27.40.42.212', 'Контроллеры, устройства управления, контроля и регулирования освещения и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В (в том числе контроллеры и модули управления нижнего уровня систем управления освещением)', 7, '27.40.42'::text, 107),
  ('27.40.42.213', 'Контроллеры, устройства управления, контроля » и регулирования освещения и мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 108),
  ('27.40.42.219', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые прочие', 7, '27.40.42'::text, 109),
  ('27.40.42.220', 'Датчики (сенсоры) и периферийные устройства систем управления освещением', 6, '27.40.42'::text, 110),
  ('27.40.42.221', 'Бесконтактные инфракрасные датчики присутствия систем управления освещением', 7, '27.40.42'::text, 111),
  ('27.40.42.222', 'Бесконтактные радиоволновые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 112),
  ('27.40.42.223', 'Бесконтактные ультразвуковые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 113),
  ('27.40.42.224', 'Датчики освещенности, спектра, ИК-датчики и прочие датчики освещенности и спектра видимой и ИК-области, в том числе фотометрические, применяемые в системах освещения ИК-датчики, датчики освещенности и спектра могут совмещать в себе функции датчиков и устройств формирования управляющих сигналов для управляемых пускорегулирующих аппаратов с целью изменения параметров искусственного освещения', 7, '27.40.42'::text, 114),
  ('27.40.42.225', 'Преобразователи интерфейсов передачи данных систем управления освещением и периферийные устройства управления, в том числе: переключатели, роторные и сенсорные устройства диммирования (регулирования мощности излучения и/или изменения цветовой температуры)', 7, '27.40.42'::text, 115),
  ('27.40.42.226', 'Мультисенсоры, применяемые в системах освещения', 7, '27.40.42'::text, 116),
  ('27.40.42.229', 'Датчики (сенсоры) и периферийные устройства систем управления освещением прочие', 7, '27.40.42'::text, 117),
  ('27.40.42.230', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением', 6, '27.40.42'::text, 118),
  ('27.40.42.231', 'Беспроводные устройства (контроллеры) группового управления и/или регулирования освещением и мониторинга систем освещения', 7, '27.40.42'::text, 119),
  ('27.40.42.232', 'Контроллеры и устройства группового управления/регулирования и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В', 7, '27.40.42'::text, 120),
  ('27.40.42.233', 'Устройства и контроллеры группового управления (регулирования) освещением и группового мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 121),
  ('27.40.42.239', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением прочие', 7, '27.40.42'::text, 122),
  ('27.40.42.290', 'Части светильников и осветительных устройств прочие', 6, '27.40.42'::text, 123),
  ('27.40.9', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 4, '27.40'::text, 124),
  ('27.40.99', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 5, '27.40.9'::text, 125),
  ('27.40.99.000', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 6, '27.40.99'::text, 126)
) as s(code, title, level, parent_code, sort_order)
join public.okpd2_codes p on p.code = s.parent_code
where c.code = s.code
  and c.parent_id is distinct from p.id;

-- Re-moderation when OKPD / note changes.
create or replace function public.protect_company_product_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.review_note := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if
    new.name is distinct from old.name
    or new.url is distinct from old.url
    or new.category_id is distinct from old.category_id
    or new.okpd_code_id is distinct from old.okpd_code_id
    or new.note_id is distinct from old.note_id
    or new.is_active is distinct from old.is_active
  then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  else
    new.moderation_status := old.moderation_status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

create or replace function public.delete_okpd2_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.okpd2_codes where parent_id = p_id) then
    raise exception 'okpd_has_children' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.company_products where okpd_code_id = p_id) then
    raise exception 'okpd_in_use' using errcode = 'P0001';
  end if;

  delete from public.okpd2_codes where id = p_id;
end;
$$;

create or replace function public.delete_product_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.company_products where note_id = p_id) then
    raise exception 'note_in_use' using errcode = 'P0001';
  end if;

  delete from public.product_notes where id = p_id;
end;
$$;

revoke all on function public.delete_okpd2_code(uuid) from public;
revoke all on function public.delete_product_note(uuid) from public;
grant execute on function public.delete_okpd2_code(uuid) to authenticated;
grant execute on function public.delete_product_note(uuid) to authenticated;

-- Directory payload: OKPD code/title + note.
create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.phone
              else null
            end,
            'email', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order,
            'category_id', p.category_id,
            'category_name', pc.name,
            'okpd_code_id', p.okpd_code_id,
            'okpd_code', oc.code,
            'okpd_title', oc.title,
            'note_id', p.note_id,
            'note_name', pn.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
        left join public.okpd2_codes oc on oc.id = p.okpd_code_id
        left join public.product_notes pn on pn.id = p.note_id
        where p.company_id = c.id
          and p.is_active is true
          and p.moderation_status = 'approved'
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000048_okpd2_and_product_notes.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000049_okpd2_seed_without_staging.sql
-- =============================================================================

-- Complete OKPD 2 + product notes setup (self-contained).
-- Safe to re-run if 00048 failed before tables were created.

drop table if exists public._okpd2_seed;

create table if not exists public.okpd2_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  parent_id uuid references public.okpd2_codes (id) on delete restrict,
  level integer not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint okpd2_codes_code_not_blank check (btrim(code) <> ''),
  constraint okpd2_codes_title_not_blank check (btrim(title) <> ''),
  constraint okpd2_codes_code_key unique (code)
);

create index if not exists okpd2_codes_parent_idx on public.okpd2_codes (parent_id);
create index if not exists okpd2_codes_active_order_idx
  on public.okpd2_codes (is_active, sort_order, code);

create table if not exists public.product_notes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_notes_name_not_blank check (btrim(name) <> ''),
  constraint product_notes_name_key unique (name)
);

create index if not exists product_notes_order_idx
  on public.product_notes (is_active, sort_order, name);

alter table public.company_products
  add column if not exists okpd_code_id uuid
    references public.okpd2_codes (id) on delete set null,
  add column if not exists note_id uuid
    references public.product_notes (id) on delete set null;

create index if not exists company_products_okpd_idx
  on public.company_products (okpd_code_id);
create index if not exists company_products_note_idx
  on public.company_products (note_id);

alter table public.okpd2_codes enable row level security;
alter table public.product_notes enable row level security;

drop policy if exists okpd2_codes_admin_all on public.okpd2_codes;
create policy okpd2_codes_admin_all
on public.okpd2_codes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists okpd2_codes_select_authenticated on public.okpd2_codes;
create policy okpd2_codes_select_authenticated
on public.okpd2_codes for select to authenticated
using (public.is_admin() or is_active is true);

drop policy if exists product_notes_admin_all on public.product_notes;
create policy product_notes_admin_all
on public.product_notes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_notes_select_authenticated on public.product_notes;
create policy product_notes_select_authenticated
on public.product_notes for select to authenticated
using (public.is_admin() or is_active is true);

grant select, insert, update, delete on public.okpd2_codes to authenticated;
grant select, insert, update, delete on public.product_notes to authenticated;

insert into public.product_notes (name, sort_order)
values
  ('для общеобразовательных учреждений', 0),
  ('для медицинских учреждений', 1),
  ('для утилитарного уличного освещения', 2),
  ('для освещения парков', 3),
  ('взрывозащищённые светильники', 4),
  ('отсутствует', 5)
on conflict (name) do nothing;

insert into public.okpd2_codes (code, title, level, parent_id, sort_order)
select s.code, s.title, s.level, null, s.sort_order
from (
  values
  ('27.40', 'Оборудование электрическое осветительное', 3, null::text, 0),
  ('27.40.1', 'Лампы накаливания или газоразрядные лампы; дуговые лампы; светодиодные лампы', 4, '27.40'::text, 1),
  ('27.40.11', 'Лампы герметичные узконаправленного света', 5, '27.40.1'::text, 2),
  ('27.40.11.000', 'Лампы герметичные узконаправленного света', 6, '27.40.11'::text, 3),
  ('27.40.12', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 5, '27.40.1'::text, 4),
  ('27.40.12.000', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 6, '27.40.12'::text, 5),
  ('27.40.13', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 5, '27.40.1'::text, 6),
  ('27.40.13.000', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 6, '27.40.13'::text, 7),
  ('27.40.14', 'Лампы накаливания прочие, не включенные в другие группировки', 5, '27.40.1'::text, 8),
  ('27.40.14.000', 'Лампы накаливания прочие, не включенные в другие группировки', 6, '27.40.14'::text, 9),
  ('27.40.15', 'Лампы газоразрядные; ультрафиолетовые и инфракрасные лампы; дуговые лампы; светодиодные лампы', 5, '27.40.1'::text, 10),
  ('27.40.15.110', 'Лампы газоразрядные', 6, '27.40.15'::text, 11),
  ('27.40.15.111', 'Лампы ртутные высокого давления', 7, '27.40.15'::text, 12),
  ('27.40.15.112', 'Лампы натриевые высокого давления', 7, '27.40.15'::text, 13),
  ('27.40.15.113', 'Лампы натриевые низкого давления', 7, '27.40.15'::text, 14),
  ('27.40.15.114', 'Лампы люминесцентные', 7, '27.40.15'::text, 15),
  ('27.40.15.115', 'Лампы металлогалогенные', 7, '27.40.15'::text, 16),
  ('27.40.15.119', 'Лампы газоразрядные прочие', 7, '27.40.15'::text, 17),
  ('27.40.15.120', 'Лампы ультрафиолетовые', 6, '27.40.15'::text, 18),
  ('27.40.15.130', 'Лампы инфракрасные', 6, '27.40.15'::text, 19),
  ('27.40.15.140', 'Лампы дуговые', 6, '27.40.15'::text, 20),
  ('27.40.15.150', 'Лампы светодиодны', 6, '27.40.15'::text, 21),
  ('27.40.2', 'Светильники и осветительные устройства', 4, '27.40'::text, 22),
  ('27.40.21', 'Светильники и фонари электрические переносные, работающие от встроенных батарей сухих элементов, аккумуляторов, магнето', 5, '27.40.2'::text, 23),
  ('27.40.21.110', 'Светильники электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 24),
  ('27.40.21.120', 'Фонари электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 25),
  ('27.40.22', 'Светильники электрические настольные, прикроватные или напольные', 5, '27.40.2'::text, 26),
  ('27.40.22.110', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами накаливания', 6, '27.40.22'::text, 27),
  ('27.40.22.120', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.22'::text, 28),
  ('27.40.22.130', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.22'::text, 29),
  ('27.40.22.190', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами прочих типов', 6, '27.40.22'::text, 30),
  ('27.40.24', 'Указатели светящиеся, световые табло и подобные им устройства', 5, '27.40.2'::text, 31),
  ('27.40.24.110', 'Указатели светящиеся', 6, '27.40.24'::text, 32),
  ('27.40.24.111', 'Указатели светящиеся, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 33),
  ('27.40.24.112', 'Указатели светящиеся, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 34),
  ('27.40.24.113', 'Указатели светящиеся, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 35),
  ('27.40.24.119', 'Указатели светящиеся, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 36),
  ('27.40.24.120', 'Табло световые и аналогичные устройства', 6, '27.40.24'::text, 37),
  ('27.40.24.121', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 38),
  ('27.40.24.122', 'Световые табло и аналогичные устройства, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 39),
  ('27.40.24.123', 'Световые табло и аналогичные устройства, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 40),
  ('27.40.24.129', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 41),
  ('27.40.25', 'Люстры и прочие устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные', 5, '27.40.2'::text, 42),
  ('27.40.25.110', 'Люстры', 6, '27.40.25'::text, 43),
  ('27.40.25.111', 'Люстры, предназначенные для использования с лампами накаливания', 7, '27.40.25'::text, 44),
  ('27.40.25.112', 'Люстры, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.25'::text, 45),
  ('27.40.25.113', 'Люстры, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.25'::text, 46),
  ('27.40.25.119', 'Люстры, предназначенные для использования с лампами прочих типов', 7, '27.40.25'::text, 47),
  ('27.40.25.120', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 48),
  ('27.40.25.121', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами накаливания, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 49),
  ('27.40.25.122', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с люминесцентными газоразрядными лампами, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 50),
  ('27.40.25.123', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 51),
  ('27.40.25.129', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами прочих типов, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 52),
  ('27.40.25.130', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 53),
  ('27.40.25.131', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.25'::text, 54),
  ('27.40.25.132', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.25'::text, 55),
  ('27.40.25.139', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.25'::text, 56),
  ('27.40.25.140', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.25'::text, 57),
  ('27.40.25.141', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с лампами накаливания; не предназначенные для иных областей применения', 7, '27.40.25'::text, 58),
  ('27.40.25.142', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.25'::text, 59),
  ('27.40.25.143', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.25'::text, 60),
  ('27.40.25.144', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.25'::text, 61),
  ('27.40.25.145', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя 6ы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.25'::text, 62),
  ('27.40.25.149', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.25'::text, 63),
  ('27.40.3', 'Светильники и осветительные устройства прочие', 4, '27.40'::text, 64),
  ('27.40.31', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 5, '27.40.3'::text, 65),
  ('27.40.31.000', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 6, '27.40.31'::text, 66),
  ('27.40.32', 'Наборы осветительные для рождественских (новогодних) елок', 5, '27.40.3'::text, 67),
  ('27.40.32.000', 'Наборы осветительные для рождественских (новогодних) елок', 6, '27.40.32'::text, 68),
  ('27.40.33', 'Прожекторы и аналогичные светильники узконаправленного света', 5, '27.40.3'::text, 69),
  ('27.40.33.110', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с лампами накаливания', 6, '27.40.33'::text, 70),
  ('27.40.33.120', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.33'::text, 71),
  ('27.40.33.130', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.33'::text, 72),
  ('27.40.33.140', 'Осветители операционные', 6, '27.40.33'::text, 73),
  ('27.40.33.190', 'Прожекторы и аналогичные светильники узконаправленного света с лампами прочих типов', 6, '27.40.33'::text, 74),
  ('27.40.33.210', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.33'::text, 75),
  ('27.40.33.211', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.33'::text, 76),
  ('27.40.33.212', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.33'::text, 77),
  ('27.40.33.213', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.33'::text, 78),
  ('27.40.33.214', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя бы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.33'::text, 79),
  ('27.40.33.219', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.33'::text, 80),
  ('27.40.39', 'Светильники и осветительные устройства прочие, не включенные в другие группировки', 5, '27.40.3'::text, 81),
  ('27.40.39.110', 'Светильники и устройства осветительные прочие, не включенные в другие группировки', 6, '27.40.39'::text, 82),
  ('27.40.39.111', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами накаливания', 7, '27.40.39'::text, 83),
  ('27.40.39.112', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.39'::text, 84),
  ('27.40.39.113', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.39'::text, 85),
  ('27.40.39.119', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами прочих типов', 7, '27.40.39'::text, 86),
  ('27.40.39.190', 'Арматура осветительная прочая, не включенная в другие группировки', 6, '27.40.39'::text, 87),
  ('27.40.39.210', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.39'::text, 88),
  ('27.40.39.211', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с лампами накаливания', 7, '27.40.39'::text, 89),
  ('27.40.39.212', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.39'::text, 90),
  ('27.40.39.213', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с разрядными лампами (кроме люминесцентных ламп)', 7, '27.40.39'::text, 91),
  ('27.40.39.214', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.39'::text, 92),
  ('27.40.39.219', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.39'::text, 93),
  ('27.40.4', 'Части ламп и осветительного оборудования', 4, '27.40'::text, 94),
  ('27.40.41', 'Части ламп накаливания или газоразрядных ламп', 5, '27.40.4'::text, 95),
  ('27.40.41.000', 'Части ламп накаливания или газоразрядных ламп', 6, '27.40.41'::text, 96),
  ('27.40.42', 'Части светильников и осветительных устройств', 5, '27.40.4'::text, 97),
  ('27.40.42.110', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных (включая источники напряжения и источники тока)', 6, '27.40.42'::text, 98),
  ('27.40.42.111', 'Блоки питания электромагнитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 99),
  ('27.40.42.112', 'Блоки питания электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 100),
  ('27.40.42.113', 'Блоки электронные защитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 101),
  ('27.40.42.114', 'Блоки питания программируемые электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 102),
  ('27.40.42.119', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных, прочие', 7, '27.40.42'::text, 103),
  ('27.40.42.200', 'Элементы системы управления освещением', 6, '27.40.42'::text, 104),
  ('27.40.42.210', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые', 6, '27.40.42'::text, 105),
  ('27.40.42.211', 'Беспроводные устройства контроля, регулирования освещения и/или мониторинга осветительных установок и беспроводные контроллеры (модули) управления', 7, '27.40.42'::text, 106),
  ('27.40.42.212', 'Контроллеры, устройства управления, контроля и регулирования освещения и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В (в том числе контроллеры и модули управления нижнего уровня систем управления освещением)', 7, '27.40.42'::text, 107),
  ('27.40.42.213', 'Контроллеры, устройства управления, контроля » и регулирования освещения и мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 108),
  ('27.40.42.219', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые прочие', 7, '27.40.42'::text, 109),
  ('27.40.42.220', 'Датчики (сенсоры) и периферийные устройства систем управления освещением', 6, '27.40.42'::text, 110),
  ('27.40.42.221', 'Бесконтактные инфракрасные датчики присутствия систем управления освещением', 7, '27.40.42'::text, 111),
  ('27.40.42.222', 'Бесконтактные радиоволновые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 112),
  ('27.40.42.223', 'Бесконтактные ультразвуковые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 113),
  ('27.40.42.224', 'Датчики освещенности, спектра, ИК-датчики и прочие датчики освещенности и спектра видимой и ИК-области, в том числе фотометрические, применяемые в системах освещения ИК-датчики, датчики освещенности и спектра могут совмещать в себе функции датчиков и устройств формирования управляющих сигналов для управляемых пускорегулирующих аппаратов с целью изменения параметров искусственного освещения', 7, '27.40.42'::text, 114),
  ('27.40.42.225', 'Преобразователи интерфейсов передачи данных систем управления освещением и периферийные устройства управления, в том числе: переключатели, роторные и сенсорные устройства диммирования (регулирования мощности излучения и/или изменения цветовой температуры)', 7, '27.40.42'::text, 115),
  ('27.40.42.226', 'Мультисенсоры, применяемые в системах освещения', 7, '27.40.42'::text, 116),
  ('27.40.42.229', 'Датчики (сенсоры) и периферийные устройства систем управления освещением прочие', 7, '27.40.42'::text, 117),
  ('27.40.42.230', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением', 6, '27.40.42'::text, 118),
  ('27.40.42.231', 'Беспроводные устройства (контроллеры) группового управления и/или регулирования освещением и мониторинга систем освещения', 7, '27.40.42'::text, 119),
  ('27.40.42.232', 'Контроллеры и устройства группового управления/регулирования и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В', 7, '27.40.42'::text, 120),
  ('27.40.42.233', 'Устройства и контроллеры группового управления (регулирования) освещением и группового мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 121),
  ('27.40.42.239', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением прочие', 7, '27.40.42'::text, 122),
  ('27.40.42.290', 'Части светильников и осветительных устройств прочие', 6, '27.40.42'::text, 123),
  ('27.40.9', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 4, '27.40'::text, 124),
  ('27.40.99', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 5, '27.40.9'::text, 125),
  ('27.40.99.000', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 6, '27.40.99'::text, 126)
) as s(code, title, level, parent_code, sort_order)
on conflict (code) do update
set
  title = excluded.title,
  level = excluded.level,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.okpd2_codes c
set
  parent_id = p.id,
  updated_at = now()
from (
  values
  ('27.40', 'Оборудование электрическое осветительное', 3, null::text, 0),
  ('27.40.1', 'Лампы накаливания или газоразрядные лампы; дуговые лампы; светодиодные лампы', 4, '27.40'::text, 1),
  ('27.40.11', 'Лампы герметичные узконаправленного света', 5, '27.40.1'::text, 2),
  ('27.40.11.000', 'Лампы герметичные узконаправленного света', 6, '27.40.11'::text, 3),
  ('27.40.12', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 5, '27.40.1'::text, 4),
  ('27.40.12.000', 'Лампы накаливания галогенные с вольфрамовой нитью, кроме ультрафиолетовых или инфракрасных ламп', 6, '27.40.12'::text, 5),
  ('27.40.13', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 5, '27.40.1'::text, 6),
  ('27.40.13.000', 'Лампы накаливания мощностью 100 - 200 Вт, не включенные в другие группировки', 6, '27.40.13'::text, 7),
  ('27.40.14', 'Лампы накаливания прочие, не включенные в другие группировки', 5, '27.40.1'::text, 8),
  ('27.40.14.000', 'Лампы накаливания прочие, не включенные в другие группировки', 6, '27.40.14'::text, 9),
  ('27.40.15', 'Лампы газоразрядные; ультрафиолетовые и инфракрасные лампы; дуговые лампы; светодиодные лампы', 5, '27.40.1'::text, 10),
  ('27.40.15.110', 'Лампы газоразрядные', 6, '27.40.15'::text, 11),
  ('27.40.15.111', 'Лампы ртутные высокого давления', 7, '27.40.15'::text, 12),
  ('27.40.15.112', 'Лампы натриевые высокого давления', 7, '27.40.15'::text, 13),
  ('27.40.15.113', 'Лампы натриевые низкого давления', 7, '27.40.15'::text, 14),
  ('27.40.15.114', 'Лампы люминесцентные', 7, '27.40.15'::text, 15),
  ('27.40.15.115', 'Лампы металлогалогенные', 7, '27.40.15'::text, 16),
  ('27.40.15.119', 'Лампы газоразрядные прочие', 7, '27.40.15'::text, 17),
  ('27.40.15.120', 'Лампы ультрафиолетовые', 6, '27.40.15'::text, 18),
  ('27.40.15.130', 'Лампы инфракрасные', 6, '27.40.15'::text, 19),
  ('27.40.15.140', 'Лампы дуговые', 6, '27.40.15'::text, 20),
  ('27.40.15.150', 'Лампы светодиодны', 6, '27.40.15'::text, 21),
  ('27.40.2', 'Светильники и осветительные устройства', 4, '27.40'::text, 22),
  ('27.40.21', 'Светильники и фонари электрические переносные, работающие от встроенных батарей сухих элементов, аккумуляторов, магнето', 5, '27.40.2'::text, 23),
  ('27.40.21.110', 'Светильники электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 24),
  ('27.40.21.120', 'Фонари электрические переносные, работающие от батарей сухих элементов, аккумуляторов, магнето', 6, '27.40.21'::text, 25),
  ('27.40.22', 'Светильники электрические настольные, прикроватные или напольные', 5, '27.40.2'::text, 26),
  ('27.40.22.110', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами накаливания', 6, '27.40.22'::text, 27),
  ('27.40.22.120', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.22'::text, 28),
  ('27.40.22.130', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.22'::text, 29),
  ('27.40.22.190', 'Светильники электрические настольные, прикроватные или напольные, предназначенные для использования с лампами прочих типов', 6, '27.40.22'::text, 30),
  ('27.40.24', 'Указатели светящиеся, световые табло и подобные им устройства', 5, '27.40.2'::text, 31),
  ('27.40.24.110', 'Указатели светящиеся', 6, '27.40.24'::text, 32),
  ('27.40.24.111', 'Указатели светящиеся, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 33),
  ('27.40.24.112', 'Указатели светящиеся, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 34),
  ('27.40.24.113', 'Указатели светящиеся, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 35),
  ('27.40.24.119', 'Указатели светящиеся, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 36),
  ('27.40.24.120', 'Табло световые и аналогичные устройства', 6, '27.40.24'::text, 37),
  ('27.40.24.121', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами накаливания', 7, '27.40.24'::text, 38),
  ('27.40.24.122', 'Световые табло и аналогичные устройства, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.24'::text, 39),
  ('27.40.24.123', 'Световые табло и аналогичные устройства, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.24'::text, 40),
  ('27.40.24.129', 'Световые табло и аналогичные устройства, предназначенные для использования с лампами прочих типов', 7, '27.40.24'::text, 41),
  ('27.40.25', 'Люстры и прочие устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные', 5, '27.40.2'::text, 42),
  ('27.40.25.110', 'Люстры', 6, '27.40.25'::text, 43),
  ('27.40.25.111', 'Люстры, предназначенные для использования с лампами накаливания', 7, '27.40.25'::text, 44),
  ('27.40.25.112', 'Люстры, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.25'::text, 45),
  ('27.40.25.113', 'Люстры, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.25'::text, 46),
  ('27.40.25.119', 'Люстры, предназначенные для использования с лампами прочих типов', 7, '27.40.25'::text, 47),
  ('27.40.25.120', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 48),
  ('27.40.25.121', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами накаливания, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 49),
  ('27.40.25.122', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с люминесцентными газоразрядными лампами, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 50),
  ('27.40.25.123', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 51),
  ('27.40.25.129', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, предназначенные для использования с лампами прочих типов, не имеющие встроенную аккумуляторную батарею и режим работы от нее', 7, '27.40.25'::text, 52),
  ('27.40.25.130', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.25'::text, 53),
  ('27.40.25.131', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.25'::text, 54),
  ('27.40.25.132', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.25'::text, 55),
  ('27.40.25.139', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.25'::text, 56),
  ('27.40.25.140', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.25'::text, 57),
  ('27.40.25.141', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с лампами накаливания; не предназначенные для иных областей применения', 7, '27.40.25'::text, 58),
  ('27.40.25.142', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.25'::text, 59),
  ('27.40.25.143', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.25'::text, 60),
  ('27.40.25.144', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.25'::text, 61),
  ('27.40.25.145', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя 6ы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.25'::text, 62),
  ('27.40.25.149', 'Устройства осветительные электрические подвесные, потолочные, встраиваемые и настенные для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.25'::text, 63),
  ('27.40.3', 'Светильники и осветительные устройства прочие', 4, '27.40'::text, 64),
  ('27.40.31', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 5, '27.40.3'::text, 65),
  ('27.40.31.000', 'Лампы-вспышки фотографические, фотоосветители типа "кубик" и аналогичные изделия', 6, '27.40.31'::text, 66),
  ('27.40.32', 'Наборы осветительные для рождественских (новогодних) елок', 5, '27.40.3'::text, 67),
  ('27.40.32.000', 'Наборы осветительные для рождественских (новогодних) елок', 6, '27.40.32'::text, 68),
  ('27.40.33', 'Прожекторы и аналогичные светильники узконаправленного света', 5, '27.40.3'::text, 69),
  ('27.40.33.110', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с лампами накаливания', 6, '27.40.33'::text, 70),
  ('27.40.33.120', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования с люминесцентными газоразрядными лампами', 6, '27.40.33'::text, 71),
  ('27.40.33.130', 'Прожекторы и аналогичные светильники узконаправленного света, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 6, '27.40.33'::text, 72),
  ('27.40.33.140', 'Осветители операционные', 6, '27.40.33'::text, 73),
  ('27.40.33.190', 'Прожекторы и аналогичные светильники узконаправленного света с лампами прочих типов', 6, '27.40.33'::text, 74),
  ('27.40.33.210', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения', 6, '27.40.33'::text, 75),
  ('27.40.33.211', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с люминесцентными лампами; не предназначенные для иных областей применения', 7, '27.40.33'::text, 76),
  ('27.40.33.212', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования с разрядными лампами (кроме люминесцентных ламп); не предназначенные для иных областей применения', 7, '27.40.33'::text, 77),
  ('27.40.33.213', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света белого цвета излучения; не предназначенные для иных областей применения', 7, '27.40.33'::text, 78),
  ('27.40.33.214', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; для использования со светодиодными источниками света, излучение которых хотя бы в одном из режимов работы не является белым; не предназначенные для иных областей применения', 7, '27.40.33'::text, 79),
  ('27.40.33.219', 'Прожекторы и аналогичные светильники узконаправленного света для целей архитектурной и художественной подсветки; не предназначенные для иных областей применения, прочие', 7, '27.40.33'::text, 80),
  ('27.40.39', 'Светильники и осветительные устройства прочие, не включенные в другие группировки', 5, '27.40.3'::text, 81),
  ('27.40.39.110', 'Светильники и устройства осветительные прочие, не включенные в другие группировки', 6, '27.40.39'::text, 82),
  ('27.40.39.111', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами накаливания', 7, '27.40.39'::text, 83),
  ('27.40.39.112', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с люминесцентными газоразрядными лампами', 7, '27.40.39'::text, 84),
  ('27.40.39.113', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования со светодиодными лампами и прочими светодиодными источниками света', 7, '27.40.39'::text, 85),
  ('27.40.39.119', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, предназначенные для использования с лампами прочих типов', 7, '27.40.39'::text, 86),
  ('27.40.39.190', 'Арматура осветительная прочая, не включенная в другие группировки', 6, '27.40.39'::text, 87),
  ('27.40.39.210', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее', 6, '27.40.39'::text, 88),
  ('27.40.39.211', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с лампами накаливания', 7, '27.40.39'::text, 89),
  ('27.40.39.212', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с люминесцентными лампами', 7, '27.40.39'::text, 90),
  ('27.40.39.213', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования с разрядными лампами (кроме люминесцентных ламп)', 7, '27.40.39'::text, 91),
  ('27.40.39.214', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее; для использования со светодиодными источниками света', 7, '27.40.39'::text, 92),
  ('27.40.39.219', 'Светильники и устройства осветительные прочие, не включенные в другие группировки, имеющие встроенную аккумуляторную батарею и режим работы от нее, прочие', 7, '27.40.39'::text, 93),
  ('27.40.4', 'Части ламп и осветительного оборудования', 4, '27.40'::text, 94),
  ('27.40.41', 'Части ламп накаливания или газоразрядных ламп', 5, '27.40.4'::text, 95),
  ('27.40.41.000', 'Части ламп накаливания или газоразрядных ламп', 6, '27.40.41'::text, 96),
  ('27.40.42', 'Части светильников и осветительных устройств', 5, '27.40.4'::text, 97),
  ('27.40.42.110', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных (включая источники напряжения и источники тока)', 6, '27.40.42'::text, 98),
  ('27.40.42.111', 'Блоки питания электромагнитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 99),
  ('27.40.42.112', 'Блоки питания электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 100),
  ('27.40.42.113', 'Блоки электронные защитные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 101),
  ('27.40.42.114', 'Блоки питания программируемые электронные, применяемые в светотехническом оборудовании', 7, '27.40.42'::text, 102),
  ('27.40.42.119', 'Источники питания, применяемые в светотехническом оборудовании и отсутствующие в других товарных группах или отличающиеся от аналогичных, прочие', 7, '27.40.42'::text, 103),
  ('27.40.42.200', 'Элементы системы управления освещением', 6, '27.40.42'::text, 104),
  ('27.40.42.210', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые', 6, '27.40.42'::text, 105),
  ('27.40.42.211', 'Беспроводные устройства контроля, регулирования освещения и/или мониторинга осветительных установок и беспроводные контроллеры (модули) управления', 7, '27.40.42'::text, 106),
  ('27.40.42.212', 'Контроллеры, устройства управления, контроля и регулирования освещения и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В (в том числе контроллеры и модули управления нижнего уровня систем управления освещением)', 7, '27.40.42'::text, 107),
  ('27.40.42.213', 'Контроллеры, устройства управления, контроля » и регулирования освещения и мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 108),
  ('27.40.42.219', 'Контроллеры систем управления освещением встраиваемые, несъемные и независимые прочие', 7, '27.40.42'::text, 109),
  ('27.40.42.220', 'Датчики (сенсоры) и периферийные устройства систем управления освещением', 6, '27.40.42'::text, 110),
  ('27.40.42.221', 'Бесконтактные инфракрасные датчики присутствия систем управления освещением', 7, '27.40.42'::text, 111),
  ('27.40.42.222', 'Бесконтактные радиоволновые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 112),
  ('27.40.42.223', 'Бесконтактные ультразвуковые датчики присутствия систем управления освещением', 7, '27.40.42'::text, 113),
  ('27.40.42.224', 'Датчики освещенности, спектра, ИК-датчики и прочие датчики освещенности и спектра видимой и ИК-области, в том числе фотометрические, применяемые в системах освещения ИК-датчики, датчики освещенности и спектра могут совмещать в себе функции датчиков и устройств формирования управляющих сигналов для управляемых пускорегулирующих аппаратов с целью изменения параметров искусственного освещения', 7, '27.40.42'::text, 114),
  ('27.40.42.225', 'Преобразователи интерфейсов передачи данных систем управления освещением и периферийные устройства управления, в том числе: переключатели, роторные и сенсорные устройства диммирования (регулирования мощности излучения и/или изменения цветовой температуры)', 7, '27.40.42'::text, 115),
  ('27.40.42.226', 'Мультисенсоры, применяемые в системах освещения', 7, '27.40.42'::text, 116),
  ('27.40.42.229', 'Датчики (сенсоры) и периферийные устройства систем управления освещением прочие', 7, '27.40.42'::text, 117),
  ('27.40.42.230', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением', 6, '27.40.42'::text, 118),
  ('27.40.42.231', 'Беспроводные устройства (контроллеры) группового управления и/или регулирования освещением и мониторинга систем освещения', 7, '27.40.42'::text, 119),
  ('27.40.42.232', 'Контроллеры и устройства группового управления/регулирования и мониторинга систем освещения, использующие проводные каналы связи напряжением до 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения до 60 В', 7, '27.40.42'::text, 120),
  ('27.40.42.233', 'Устройства и контроллеры группового управления (регулирования) освещением и группового мониторинга систем освещения, использующие линии питания систем освещения/электроснабжения освещения как проводные каналы связи и/или каналы связи с напряжением выше 60 В постоянного тока или переменного напряжения с амплитудным значением напряжения выше 60 В', 7, '27.40.42'::text, 121),
  ('27.40.42.239', 'Устройства (контроллеры) группового управления и регулирования системами управления освещением прочие', 7, '27.40.42'::text, 122),
  ('27.40.42.290', 'Части светильников и осветительных устройств прочие', 6, '27.40.42'::text, 123),
  ('27.40.9', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 4, '27.40'::text, 124),
  ('27.40.99', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 5, '27.40.9'::text, 125),
  ('27.40.99.000', 'Услуги по производству электрического осветительного оборудования отдельные, выполняемые субподрядчиком', 6, '27.40.99'::text, 126)
) as s(code, title, level, parent_code, sort_order)
join public.okpd2_codes p on p.code = s.parent_code
where c.code = s.code
  and c.parent_id is distinct from p.id;

-- Re-moderation when OKPD / note changes.
create or replace function public.protect_company_product_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.review_note := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if
    new.name is distinct from old.name
    or new.url is distinct from old.url
    or new.category_id is distinct from old.category_id
    or new.okpd_code_id is distinct from old.okpd_code_id
    or new.note_id is distinct from old.note_id
    or new.is_active is distinct from old.is_active
  then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  else
    new.moderation_status := old.moderation_status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

create or replace function public.delete_okpd2_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.okpd2_codes where parent_id = p_id) then
    raise exception 'okpd_has_children' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.company_products where okpd_code_id = p_id) then
    raise exception 'okpd_in_use' using errcode = 'P0001';
  end if;

  delete from public.okpd2_codes where id = p_id;
end;
$$;

create or replace function public.delete_product_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.company_products where note_id = p_id) then
    raise exception 'note_in_use' using errcode = 'P0001';
  end if;

  delete from public.product_notes where id = p_id;
end;
$$;

revoke all on function public.delete_okpd2_code(uuid) from public;
revoke all on function public.delete_product_note(uuid) from public;
grant execute on function public.delete_okpd2_code(uuid) to authenticated;
grant execute on function public.delete_product_note(uuid) to authenticated;

-- Directory payload: OKPD code/title + note.
create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.phone
              else null
            end,
            'email', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order,
            'category_id', p.category_id,
            'category_name', pc.name,
            'okpd_code_id', p.okpd_code_id,
            'okpd_code', oc.code,
            'okpd_title', oc.title,
            'note_id', p.note_id,
            'note_name', pn.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
        left join public.okpd2_codes oc on oc.id = p.okpd_code_id
        left join public.product_notes pn on pn.id = p.note_id
        where p.company_id = c.id
          and p.is_active is true
          and p.moderation_status = 'approved'
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- =============================================================================
-- END 20260715000049_okpd2_seed_without_staging.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000050_product_okpd_note_proposals.sql
-- =============================================================================

-- Member proposals for custom OKPD 2 codes and product notes.
-- On product approval, proposals are upserted into settings dictionaries.

alter table public.company_products
  add column if not exists proposed_okpd_code text,
  add column if not exists proposed_okpd_title text,
  add column if not exists proposed_note_name text;

alter table public.company_products
  drop constraint if exists company_products_proposed_okpd_pair;

alter table public.company_products
  add constraint company_products_proposed_okpd_pair
  check (
    (proposed_okpd_code is null and proposed_okpd_title is null)
    or (
      proposed_okpd_code is not null
      and btrim(proposed_okpd_code) <> ''
      and proposed_okpd_title is not null
      and btrim(proposed_okpd_title) <> ''
    )
  );

alter table public.company_products
  drop constraint if exists company_products_proposed_note_not_blank;

alter table public.company_products
  add constraint company_products_proposed_note_not_blank
  check (
    proposed_note_name is null
    or btrim(proposed_note_name) <> ''
  );

-- Resolve / create dictionary rows from product proposals; mutates NEW in BEFORE trigger.
create or replace function public.resolve_company_product_proposals()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_code text;
  v_title text;
  v_note text;
  v_okpd_id uuid;
  v_note_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_sort integer;
begin
  -- Only materialize into dictionaries when the product is approved.
  if new.moderation_status is distinct from 'approved'::public.product_moderation_status then
    return new;
  end if;

  v_code := nullif(btrim(coalesce(new.proposed_okpd_code, '')), '');
  v_title := nullif(btrim(coalesce(new.proposed_okpd_title, '')), '');
  v_note := nullif(btrim(coalesce(new.proposed_note_name, '')), '');

  if v_code is not null and v_title is not null then
    select id into v_okpd_id
    from public.okpd2_codes
    where code = v_code
    limit 1;

    if v_okpd_id is null then
      -- Parent = longest existing code that is a proper prefix (dot boundary).
      select id into v_parent_id
      from public.okpd2_codes
      where v_code like code || '.%'
      order by length(code) desc
      limit 1;

      v_level := cardinality(string_to_array(v_code, '.')) + 1;

      select coalesce(max(sort_order), -1) + 1 into v_sort
      from public.okpd2_codes
      where parent_id is not distinct from v_parent_id;

      insert into public.okpd2_codes (code, title, parent_id, level, sort_order, is_active)
      values (v_code, v_title, v_parent_id, v_level, v_sort, true)
      on conflict (code) do update
        set
          title = excluded.title,
          is_active = true,
          updated_at = now()
      returning id into v_okpd_id;
    else
      update public.okpd2_codes
      set
        title = v_title,
        is_active = true,
        updated_at = now()
      where id = v_okpd_id
        and (title is distinct from v_title or is_active is not true);
    end if;

    new.okpd_code_id := v_okpd_id;
    new.name := left(v_title, 200);
    new.proposed_okpd_code := null;
    new.proposed_okpd_title := null;
  end if;

  if v_note is not null then
    insert into public.product_notes (name, sort_order, is_active)
    values (
      v_note,
      (select coalesce(max(sort_order), -1) + 1 from public.product_notes),
      true
    )
    on conflict (name) do update
      set is_active = true
    returning id into v_note_id;

    new.note_id := v_note_id;
    new.proposed_note_name := null;
  end if;

  return new;
end;
$$;

drop trigger if exists company_products_resolve_proposals on public.company_products;
create trigger company_products_resolve_proposals
before insert or update on public.company_products
for each row execute function public.resolve_company_product_proposals();

-- Re-moderation when OKPD / note / proposals change.
create or replace function public.protect_company_product_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.review_note := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if
    new.name is distinct from old.name
    or new.url is distinct from old.url
    or new.category_id is distinct from old.category_id
    or new.okpd_code_id is distinct from old.okpd_code_id
    or new.note_id is distinct from old.note_id
    or new.proposed_okpd_code is distinct from old.proposed_okpd_code
    or new.proposed_okpd_title is distinct from old.proposed_okpd_title
    or new.proposed_note_name is distinct from old.proposed_note_name
    or new.is_active is distinct from old.is_active
  then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  else
    new.moderation_status := old.moderation_status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

-- Keep notifications + apply proposals via UPDATE (resolve trigger runs first).
create or replace function public.review_company_product(
  p_product_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  update public.company_products
  set
    moderation_status = case when p_approve then 'approved'::public.product_moderation_status
      else 'rejected'::public.product_moderation_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = v_note
  where id = p_product_id
  returning * into v_product;

  if p_approve then
    perform public.notify_company_members(
      v_product.company_id,
      'product_approved'::public.notification_type,
      'Продукция одобрена',
      format('«%s» опубликована в справочнике ассоциации.', v_product.name),
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name)
    );
  else
    perform public.notify_company_members(
      v_product.company_id,
      'product_rejected'::public.notification_type,
      'Продукция отклонена',
      case
        when v_note is not null then format('«%s»: %s', v_product.name, v_note)
        else format('«%s» не прошла модерацию.', v_product.name)
      end,
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name, 'note', v_note)
    );
  end if;

  return v_product;
end;
$$;

revoke all on function public.review_company_product(uuid, boolean, text) from public;
grant execute on function public.review_company_product(uuid, boolean, text) to authenticated;

-- =============================================================================
-- END 20260715000050_product_okpd_note_proposals.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000051_admin_notifications.sql
-- =============================================================================

-- Admin in-app notifications for key moderation / registration events.

do $$
begin
  alter type public.notification_type add value if not exists 'registration_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'product_moderation_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'category_suggestion_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'material_moderation_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'material_category_pending';
exception
  when duplicate_object then null;
end
$$;

-- Notify all non-blocked admins.
create or replace function public.notify_admins(
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
  insert into public.notifications (
    user_id,
    company_id,
    type,
    title,
    body,
    link,
    entity_type,
    entity_id,
    payload
  )
  select
    u.id,
    p_company_id,
    p_type,
    p_title,
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_link, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  from public.users u
  where u.role = 'admin'
    and u.status is distinct from 'blocked';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_admins(
  public.notification_type, text, text, text, text, uuid, uuid, jsonb
) from public;

-- Email toggle: confirmed members OR non-blocked admins.
create or replace function public.set_own_email_notifications(p_enabled boolean)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.users
  set email_notifications_enabled = coalesce(p_enabled, false)
  where id = auth.uid()
    and (
      (role = 'member' and status = 'confirmed')
      or (role = 'admin' and status is distinct from 'blocked')
    )
  returning * into v_user;

  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

revoke all on function public.set_own_email_notifications(boolean) from public;
grant execute on function public.set_own_email_notifications(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- New registration (pending member)
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_registration()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.role = 'member' and new.status = 'pending' then
    perform public.notify_admins(
      'registration_pending'::public.notification_type,
      'Новая заявка на регистрацию',
      format(
        '%s (%s)',
        coalesce(nullif(btrim(new.full_name), ''), 'Без имени'),
        coalesce(nullif(btrim(new.email), ''), 'без email')
      ),
      '/admin/registrations',
      'users',
      new.id,
      null,
      jsonb_build_object(
        'email', new.email,
        'full_name', new.full_name,
        'company_name_hint', new.company_name_hint
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists users_notify_admins_registration on public.users;
create trigger users_notify_admins_registration
after insert on public.users
for each row
execute function public.trg_notify_admins_registration();

-- -----------------------------------------------------------------------------
-- Product moderation queue
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_product_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_name text;
begin
  if new.moderation_status is distinct from 'pending'::public.product_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.product_moderation_status then
    return new;
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = new.company_id;

  perform public.notify_admins(
    'product_moderation_pending'::public.notification_type,
    'Продукция на модерации',
    format(
      '«%s» — %s',
      coalesce(nullif(btrim(new.name), ''), 'Без названия'),
      coalesce(v_company_name, 'компания')
    ),
    '/admin/registrations',
    'company_products',
    new.id,
    new.company_id,
    jsonb_build_object('name', new.name, 'company_id', new.company_id)
  );

  return new;
end;
$$;

drop trigger if exists company_products_notify_admins_pending on public.company_products;
create trigger company_products_notify_admins_pending
after insert or update of moderation_status on public.company_products
for each row
execute function public.trg_notify_admins_product_pending();

-- -----------------------------------------------------------------------------
-- Product category suggestion
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_category_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status is distinct from 'pending'::public.product_category_suggestion_status then
    return new;
  end if;

  perform public.notify_admins(
    'category_suggestion_pending'::public.notification_type,
    'Предложена категория продукции',
    format('«%s»', coalesce(nullif(btrim(new.suggested_name), ''), 'Без названия')),
    '/admin/registrations',
    'product_category_suggestions',
    new.id,
    new.company_id,
    jsonb_build_object('suggested_name', new.suggested_name, 'product_id', new.product_id)
  );

  return new;
end;
$$;

drop trigger if exists product_category_suggestions_notify_admins on public.product_category_suggestions;
create trigger product_category_suggestions_notify_admins
after insert on public.product_category_suggestions
for each row
execute function public.trg_notify_admins_category_suggestion();

-- -----------------------------------------------------------------------------
-- Material section moderation
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_material_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.moderation_status is distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  perform public.notify_admins(
    'material_moderation_pending'::public.notification_type,
    'Материал на модерации',
    format('«%s»', coalesce(nullif(btrim(new.title), ''), 'Без названия')),
    '/admin/registrations',
    'material_sections',
    new.id,
    null,
    jsonb_build_object('title', new.title, 'slug', new.slug)
  );

  return new;
end;
$$;

drop trigger if exists material_sections_notify_admins_pending on public.material_sections;
create trigger material_sections_notify_admins_pending
after insert or update of moderation_status on public.material_sections
for each row
execute function public.trg_notify_admins_material_pending();

-- -----------------------------------------------------------------------------
-- Material category moderation
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_material_category_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.moderation_status is distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  perform public.notify_admins(
    'material_category_pending'::public.notification_type,
    'Категория материала на модерации',
    format('«%s»', coalesce(nullif(btrim(new.name), ''), 'Без названия')),
    '/admin/registrations',
    'material_categories',
    new.id,
    null,
    jsonb_build_object('name', new.name)
  );

  return new;
end;
$$;

drop trigger if exists material_categories_notify_admins_pending on public.material_categories;
create trigger material_categories_notify_admins_pending
after insert or update of moderation_status on public.material_categories
for each row
execute function public.trg_notify_admins_material_category_pending();

-- =============================================================================
-- END 20260715000051_admin_notifications.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000052_registration_confirmed_notification.sql
-- =============================================================================

-- Notify the member when their registration is confirmed.

do $$
begin
  alter type public.notification_type add value if not exists 'registration_confirmed';
exception
  when duplicate_object then null;
end
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    company_id,
    type,
    title,
    body,
    link,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_user_id,
    p_company_id,
    p_type,
    p_title,
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_link, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.notify_user(
  uuid, public.notification_type, text, text, text, text, uuid, uuid, jsonb
) from public;

create or replace function public.trg_notify_member_registration_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid;
begin
  if new.role is distinct from 'member' then
    return new;
  end if;

  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;

  select r.company_id
  into v_company_id
  from public.representatives r
  where r.id = new.representative_id;

  perform public.notify_user(
    new.id,
    'registration_confirmed'::public.notification_type,
    'Заявка на регистрацию принята',
    'Ваша учётная запись подтверждена. Можно пользоваться личным кабинетом.',
    '/cabinet',
    'users',
    new.id,
    v_company_id,
    jsonb_build_object('status', new.status)
  );

  return new;
end;
$$;

drop trigger if exists users_notify_member_registration_confirmed on public.users;
create trigger users_notify_member_registration_confirmed
after update of status on public.users
for each row
execute function public.trg_notify_member_registration_confirmed();

-- =============================================================================
-- END 20260715000052_registration_confirmed_notification.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000053_fix_max_chat_id_zero.sql
-- =============================================================================

-- Max DMs were sometimes bound / stored as chat_id "0". Outbound must use user_id.

with peers as (
  select distinct on (m.work_group_id)
    m.work_group_id,
    m.author_external_id as user_id
  from public.messages m
  inner join public.messenger_connections c
    on c.work_group_id = m.work_group_id
   and c.platform = 'max'
   and c.chat_id = '0'
  where m.source = 'max'
    and m.external_chat_id = '0'
    and m.author_external_id is not null
    and trim(m.author_external_id) <> ''
    and m.author_external_id <> '0'
  order by m.work_group_id, m.sent_at desc nulls last
)
update public.messenger_connections c
set
  chat_id = peers.user_id,
  last_error = null,
  bot_status = 'connected'
from peers
where c.work_group_id = peers.work_group_id
  and c.platform = 'max'
  and c.chat_id = '0';

with peers as (
  select distinct on (m.work_group_id)
    m.work_group_id,
    m.author_external_id as user_id
  from public.messages m
  where m.source = 'max'
    and m.external_chat_id = '0'
    and m.author_external_id is not null
    and trim(m.author_external_id) <> ''
    and m.author_external_id <> '0'
  order by m.work_group_id, m.sent_at desc nulls last
)
update public.messages m
set external_chat_id = peers.user_id
from peers
where m.work_group_id = peers.work_group_id
  and m.source = 'max'
  and m.external_chat_id = '0';

update public.messenger_bot_channels
set is_active = false,
    updated_at = now()
where platform = 'max'
  and external_chat_id = '0';

-- Ensure healed user ids exist as active private catalog rows.
with peers as (
  select distinct on (m.work_group_id)
    m.work_group_id,
    m.author_external_id as user_id,
    c.chat_title
  from public.messages m
  inner join public.messenger_connections c
    on c.work_group_id = m.work_group_id
   and c.platform = 'max'
   and c.chat_id = m.author_external_id
  where m.source = 'max'
    and m.author_external_id is not null
    and trim(m.author_external_id) <> ''
    and m.author_external_id <> '0'
    and (
      m.external_chat_id = m.author_external_id
      or (m.payload -> 'max' ->> 'chat_kind') = 'private'
    )
  order by m.work_group_id, m.sent_at desc nulls last
)
insert into public.messenger_bot_channels (
  platform,
  external_chat_id,
  title,
  username,
  chat_kind,
  is_active,
  last_seen_at
)
select
  'max',
  peers.user_id,
  coalesce(nullif(trim(peers.chat_title), ''), 'Личные'),
  null,
  'private',
  true,
  now()
from peers
on conflict (platform, external_chat_id) do update
set
  chat_kind = 'private',
  is_active = true,
  updated_at = now();

-- =============================================================================
-- END 20260715000053_fix_max_chat_id_zero.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000054_demote_from_staff.sql
-- =============================================================================

-- Demote APSS staff back to company representative without blocking the account.

create or replace function public.demote_from_staff(
  p_user_id uuid,
  p_company_id uuid,
  p_position text default null,
  p_is_primary boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_rep public.representatives;
  v_email text;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_make_primary boolean := coalesce(p_is_primary, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Нельзя снять статус с собственной учётной записи' using errcode = 'P0001';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  if coalesce(v_user.is_ceo, false) then
    if not coalesce(v_actor.is_ceo, false) then
      raise exception 'Снять статус с гендиректора может только гендиректор' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.users u
      where u.role = 'admin'
        and u.is_ceo is true
        and u.status is distinct from 'blocked'
        and u.id <> v_user.id
    ) then
      raise exception 'Нельзя снять статус с единственного гендиректора' using errcode = 'P0001';
    end if;
  end if;

  v_email := nullif(lower(trim(coalesce(v_user.email, ''))), '');

  -- Prefer an orphan representative with the same email (same company first).
  if v_email is not null then
    select r.* into v_rep
    from public.representatives r
    where lower(trim(coalesce(r.email, ''))) = v_email
      and not exists (
        select 1 from public.users u where u.representative_id = r.id
      )
    order by case when r.company_id = p_company_id then 0 else 1 end, r.created_at asc
    limit 1
    for update of r;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = false,
        is_active = true,
        position = coalesce(v_position, position),
        full_name = coalesce(
          nullif(trim(coalesce(v_user.full_name, '')), ''),
          full_name
        ),
        email = coalesce(v_email, email)
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_rep.id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(
        nullif(trim(coalesce(v_user.full_name, '')), ''),
        split_part(v_user.email, '@', 1)
      ),
      v_position,
      null,
      v_email,
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;
  end if;

  update public.users
  set
    role = 'member',
    status = 'confirmed',
    representative_id = v_rep.id,
    staff_position = null,
    is_ceo = false,
    can_manage_work_groups = false
  where id = p_user_id
  returning * into v_user;

  if v_make_primary and v_rep.is_active then
    perform public.set_primary_representative(v_rep.id);
  end if;

  return v_user;
end;
$$;

revoke all on function public.demote_from_staff(uuid, uuid, text, boolean) from public;
grant execute on function public.demote_from_staff(uuid, uuid, text, boolean) to authenticated, service_role;

-- =============================================================================
-- END 20260715000054_demote_from_staff.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000055_staff_company_context.sql
-- =============================================================================

-- Staff can keep role=admin and still act as company representative (cabinet / voting).
-- Bind company to staff separately; widen member company-context helpers for dual-role.

-- =============================================================================
-- 1) list_staff_users with company context
-- =============================================================================

drop function if exists public.list_staff_users();

create or replace function public.list_staff_users()
returns table (
  id uuid,
  email text,
  full_name text,
  status public.user_status,
  staff_position text,
  is_ceo boolean,
  can_manage_work_groups boolean,
  created_at timestamptz,
  representative_id uuid,
  company_id uuid,
  company_name text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email,
    u.full_name,
    u.status,
    u.staff_position,
    u.is_ceo,
    u.can_manage_work_groups,
    u.created_at,
    u.representative_id,
    c.id as company_id,
    c.name as company_name
  from public.users u
  left join public.representatives r on r.id = u.representative_id
  left join public.companies c on c.id = r.company_id
  where u.role = 'admin'
  order by u.is_ceo desc, u.full_name nulls last, u.email;
end;
$$;

revoke all on function public.list_staff_users() from public;
grant execute on function public.list_staff_users() to authenticated, service_role;

-- =============================================================================
-- 2) bind / unbind staff ↔ company (keep role=admin)
-- =============================================================================

create or replace function public.bind_staff_to_company(
  p_user_id uuid,
  p_company_id uuid,
  p_position text default null,
  p_is_primary boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep public.representatives;
  v_email text;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_make_primary boolean := coalesce(p_is_primary, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' then
    raise exception 'Сотрудник заблокирован' using errcode = 'P0001';
  end if;

  -- Already linked: move or refresh representative for the target company.
  if v_user.representative_id is not null then
    select * into v_rep
    from public.representatives
    where id = v_user.representative_id
    for update;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
        is_active = true,
        position = coalesce(v_position, position),
        full_name = coalesce(
          nullif(trim(coalesce(v_user.full_name, '')), ''),
          full_name
        )
      where id = v_rep.id
      returning * into v_rep;

      update public.users
      set status = 'confirmed'
      where id = p_user_id
        and status is distinct from 'confirmed';

      select * into v_user from public.users where id = p_user_id;

      if v_make_primary and v_rep.is_active then
        perform public.set_primary_representative(v_rep.id);
      end if;

      return v_user;
    end if;

    update public.users set representative_id = null where id = p_user_id;
    v_user.representative_id := null;
  end if;

  v_email := nullif(lower(trim(coalesce(v_user.email, ''))), '');

  select null::public.representatives into v_rep;

  if v_email is not null then
    select r.* into v_rep
    from public.representatives r
    where lower(trim(coalesce(r.email, ''))) = v_email
      and not exists (
        select 1 from public.users u where u.representative_id = r.id
      )
    order by case when r.company_id = p_company_id then 0 else 1 end, r.created_at asc
    limit 1
    for update of r;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = false,
        is_active = true,
        position = coalesce(v_position, position),
        full_name = coalesce(
          nullif(trim(coalesce(v_user.full_name, '')), ''),
          full_name
        ),
        email = coalesce(v_email, email)
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_rep is null or v_rep.id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(
        nullif(trim(coalesce(v_user.full_name, '')), ''),
        split_part(v_user.email, '@', 1)
      ),
      v_position,
      null,
      v_email,
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;
  end if;

  update public.users
  set
    representative_id = v_rep.id,
    status = 'confirmed'
  where id = p_user_id
  returning * into v_user;

  if v_make_primary and v_rep.is_active then
    perform public.set_primary_representative(v_rep.id);
  end if;

  return v_user;
end;
$$;

revoke all on function public.bind_staff_to_company(uuid, uuid, text, boolean) from public;
grant execute on function public.bind_staff_to_company(uuid, uuid, text, boolean) to authenticated, service_role;

create or replace function public.unbind_staff_from_company(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  update public.users
  set representative_id = null
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.unbind_staff_from_company(uuid) from public;
grant execute on function public.unbind_staff_from_company(uuid) to authenticated, service_role;

-- =============================================================================
-- 3) Company-context helpers: allow admin with representative_id
-- =============================================================================

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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
  );
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
    and u.representative_id is not null
    and (
      (u.role = 'member' and u.status = 'confirmed')
      or (u.role = 'admin' and u.status is distinct from 'blocked')
    )
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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
      and c.access_status = 'active'
      and c.participation_level_id is not null
      and pla.participation_level_id = c.participation_level_id
  );
$$;

-- =============================================================================
-- 4) cast_vote: allow dual-role staff
-- =============================================================================

create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
  v_can_vote boolean;
begin
  select * into v_user from public.users u where u.id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_can_vote := (
    (v_user.role = 'member' and v_user.status = 'confirmed')
    or (v_user.role = 'admin' and v_user.status is distinct from 'blocked')
  );

  if not v_can_vote then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives r where r.id = v_user.representative_id;
  if not found then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_company from public.companies c where c.id = v_rep.company_id;
  if not found then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls p where p.id = p_poll_id;
  if not found or v_poll.status <> 'active' then
    raise exception 'poll_not_active' using errcode = 'P0001';
  end if;

  if v_poll.starts_at is not null and v_poll.starts_at > now() then
    raise exception 'poll_not_started' using errcode = 'P0001';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at < now() then
    raise exception 'poll_ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.poll_level_access pla
    where pla.poll_id = p_poll_id
      and pla.participation_level_id = v_company.participation_level_id
  ) then
    raise exception 'poll_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.poll_options o
    where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  if v_poll.vote_mode = 'per_company' then
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':c:' || v_company.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes v
      where v.poll_id = p_poll_id and v.company_id = v_company.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':r:' || v_rep.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes v
      where v.poll_id = p_poll_id and v.representative_id = v_rep.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.poll_votes (poll_id, poll_option_id, representative_id, company_id)
    values (p_poll_id, p_option_id, v_rep.id, v_company.id)
    returning * into v_vote;
  exception
    when unique_violation then
      raise exception 'already_voted' using errcode = 'P0001';
  end;

  return v_vote;
end;
$$;

-- =============================================================================
-- 5) get_cabinet_poll_access_hint: dual-role staff
-- =============================================================================

create or replace function public.get_cabinet_poll_access_hint()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_company public.companies;
  v_active_total int;
  v_matching int;
  v_has_context boolean;
begin
  select * into v_user from public.users where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  v_has_context := (
    v_user.representative_id is not null
    and (
      (v_user.role = 'member' and v_user.status = 'confirmed')
      or (v_user.role = 'admin' and v_user.status is distinct from 'blocked')
    )
  );

  if not v_has_context then
    if v_user.role = 'admin' and v_user.representative_id is null then
      return jsonb_build_object('ok', false, 'reason', 'no_representative');
    end if;
    if v_user.role <> 'member' then
      return jsonb_build_object('ok', false, 'reason', 'not_member');
    end if;
    if v_user.status <> 'confirmed' then
      return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
    end if;
    if v_user.representative_id is null then
      return jsonb_build_object('ok', false, 'reason', 'no_representative');
    end if;
  end if;

  select c.* into v_company
  from public.representatives r
  join public.companies c on c.id = r.company_id
  where r.id = v_user.representative_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_company');
  end if;

  if v_company.access_status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'company_inactive',
      'company_name', v_company.name,
      'access_status', v_company.access_status
    );
  end if;

  if v_company.participation_level_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_level',
      'company_name', v_company.name
    );
  end if;

  select count(*)::int into v_active_total
  from public.polls p
  where p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at >= now());

  select count(*)::int into v_matching
  from public.polls p
  join public.poll_level_access pla on pla.poll_id = p.id
  where p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at >= now())
    and pla.participation_level_id = v_company.participation_level_id;

  if v_matching > 0 then
    return jsonb_build_object(
      'ok', true,
      'reason', 'ok',
      'matching_count', v_matching,
      'active_total', v_active_total
    );
  end if;

  if v_active_total = 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_active_polls',
      'active_total', 0,
      'matching_count', 0
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'reason', 'level_mismatch',
    'active_total', v_active_total,
    'matching_count', 0,
    'company_name', v_company.name
  );
end;
$$;

-- =============================================================================
-- END 20260715000055_staff_company_context.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000056_cabinet_work_groups.sql
-- =============================================================================

-- Cabinet: list work groups with current representative membership status.

create or replace function public.list_cabinet_work_groups()
returns table (
  id uuid,
  name text,
  description text,
  status public.work_group_status,
  category_id uuid,
  category_name text,
  is_member boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep_id uuid;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_rep_id := public.current_representative_id();

  return query
  select
    wg.id,
    wg.name,
    wg.description,
    wg.status,
    wg.category_id,
    cat.name as category_name,
    (wgm.id is not null) as is_member,
    wgm.created_at as joined_at
  from public.work_groups wg
  left join public.work_group_categories cat on cat.id = wg.category_id
  left join public.work_group_members wgm
    on wgm.work_group_id = wg.id
   and wgm.representative_id = v_rep_id
  where wg.status is distinct from 'archived'
  order by
    (wgm.id is not null) desc,
    cat.name nulls last,
    wg.name;
end;
$$;

revoke all on function public.list_cabinet_work_groups() from public;
grant execute on function public.list_cabinet_work_groups() to authenticated, service_role;

-- =============================================================================
-- END 20260715000056_cabinet_work_groups.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000057_work_group_membership_requests.sql
-- =============================================================================

-- Work group join/leave requests from company representatives (admin moderation).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'work_group_membership_request_kind') then
    create type public.work_group_membership_request_kind as enum ('join', 'leave');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'work_group_membership_request_status') then
    create type public.work_group_membership_request_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'work_group_membership_pending';
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.work_group_membership_requests (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  representative_id uuid not null references public.representatives (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  requested_by uuid not null references public.users (id) on delete cascade,
  kind public.work_group_membership_request_kind not null,
  status public.work_group_membership_request_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists work_group_membership_requests_status_idx
  on public.work_group_membership_requests (status, created_at desc);

create index if not exists work_group_membership_requests_group_idx
  on public.work_group_membership_requests (work_group_id, created_at desc);

create unique index if not exists work_group_membership_requests_pending_idx
  on public.work_group_membership_requests (work_group_id, representative_id)
  where status = 'pending';

alter table public.work_group_membership_requests enable row level security;

drop policy if exists work_group_membership_requests_admin_all
  on public.work_group_membership_requests;
create policy work_group_membership_requests_admin_all
on public.work_group_membership_requests for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_group_membership_requests_member_read
  on public.work_group_membership_requests;
create policy work_group_membership_requests_member_read
on public.work_group_membership_requests for select to authenticated
using (
  representative_id = public.current_representative_id()
  and company_id = public.current_company_id()
);

-- -----------------------------------------------------------------------------
-- Cabinet list: include pending request fields
-- -----------------------------------------------------------------------------

drop function if exists public.list_cabinet_work_groups();

create or replace function public.list_cabinet_work_groups()
returns table (
  id uuid,
  name text,
  description text,
  status public.work_group_status,
  category_id uuid,
  category_name text,
  is_member boolean,
  joined_at timestamptz,
  pending_request_id uuid,
  pending_request_kind public.work_group_membership_request_kind,
  pending_request_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep_id uuid;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_rep_id := public.current_representative_id();

  return query
  select
    wg.id,
    wg.name,
    wg.description,
    wg.status,
    wg.category_id,
    cat.name as category_name,
    (wgm.id is not null) as is_member,
    wgm.created_at as joined_at,
    req.id as pending_request_id,
    req.kind as pending_request_kind,
    req.created_at as pending_request_at
  from public.work_groups wg
  left join public.work_group_categories cat on cat.id = wg.category_id
  left join public.work_group_members wgm
    on wgm.work_group_id = wg.id
   and wgm.representative_id = v_rep_id
  left join public.work_group_membership_requests req
    on req.work_group_id = wg.id
   and req.representative_id = v_rep_id
   and req.status = 'pending'::public.work_group_membership_request_status
  where wg.status is distinct from 'archived'
  order by
    (wgm.id is not null) desc,
    cat.name nulls last,
    wg.name;
end;
$$;

revoke all on function public.list_cabinet_work_groups() from public;
grant execute on function public.list_cabinet_work_groups() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Submit join / leave request
-- -----------------------------------------------------------------------------

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
  v_company_status public.company_access_status;
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

  if v_company_status is not distinct from 'archived'::public.company_access_status then
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

revoke all on function public.request_work_group_membership(
  uuid,
  public.work_group_membership_request_kind
) from public;
grant execute on function public.request_work_group_membership(
  uuid,
  public.work_group_membership_request_kind
) to authenticated;

-- -----------------------------------------------------------------------------
-- Admin review
-- -----------------------------------------------------------------------------

create or replace function public.review_work_group_membership_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.work_group_membership_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_request public.work_group_membership_requests;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_request
  from public.work_group_membership_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending'::public.work_group_membership_request_status then
    raise exception 'request_already_reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_request.kind = 'join'::public.work_group_membership_request_kind then
      insert into public.work_group_members (work_group_id, representative_id, added_by)
      values (v_request.work_group_id, v_request.representative_id, auth.uid())
      on conflict (work_group_id, representative_id) do nothing;
    else
      delete from public.work_group_members
      where work_group_id = v_request.work_group_id
        and representative_id = v_request.representative_id;
    end if;
  end if;

  update public.work_group_membership_requests
  set
    status = case
      when p_approve then 'approved'::public.work_group_membership_request_status
      else 'rejected'::public.work_group_membership_request_status
    end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.review_work_group_membership_request(uuid, boolean, text)
  from public;
grant execute on function public.review_work_group_membership_request(uuid, boolean, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Notify admins on new pending request
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_work_group_membership()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_group_name text;
  v_company_name text;
  v_kind_label text;
begin
  if new.status is distinct from 'pending'::public.work_group_membership_request_status then
    return new;
  end if;

  select wg.name into v_group_name
  from public.work_groups wg
  where wg.id = new.work_group_id;

  select c.name into v_company_name
  from public.companies c
  where c.id = new.company_id;

  v_kind_label := case new.kind
    when 'join'::public.work_group_membership_request_kind then 'вступление'
    else 'выход'
  end;

  perform public.notify_admins(
    'work_group_membership_pending'::public.notification_type,
    format('Заявка на %s в рабочую группу', v_kind_label),
    format(
      '«%s» · %s',
      coalesce(nullif(btrim(v_group_name), ''), 'Группа'),
      coalesce(nullif(btrim(v_company_name), ''), 'Компания')
    ),
    '/admin/registrations',
    'work_group_membership_requests',
    new.id,
    new.company_id,
    jsonb_build_object(
      'kind', new.kind,
      'work_group_id', new.work_group_id,
      'representative_id', new.representative_id
    )
  );

  return new;
end;
$$;

drop trigger if exists work_group_membership_requests_notify_admins
  on public.work_group_membership_requests;
create trigger work_group_membership_requests_notify_admins
after insert on public.work_group_membership_requests
for each row
execute function public.trg_notify_admins_work_group_membership();

-- =============================================================================
-- END 20260715000057_work_group_membership_requests.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000058_staff_company_position.sql
-- =============================================================================

-- Return company representative position (and primary flag) in staff list.

drop function if exists public.list_staff_users();

create or replace function public.list_staff_users()
returns table (
  id uuid,
  email text,
  full_name text,
  status public.user_status,
  staff_position text,
  is_ceo boolean,
  can_manage_work_groups boolean,
  created_at timestamptz,
  representative_id uuid,
  company_id uuid,
  company_name text,
  company_position text,
  is_primary boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email,
    u.full_name,
    u.status,
    u.staff_position,
    u.is_ceo,
    u.can_manage_work_groups,
    u.created_at,
    u.representative_id,
    c.id as company_id,
    c.name as company_name,
    r.position as company_position,
    coalesce(r.is_primary, false) as is_primary
  from public.users u
  left join public.representatives r on r.id = u.representative_id
  left join public.companies c on c.id = r.company_id
  where u.role = 'admin'
  order by u.is_ceo desc, u.full_name nulls last, u.email;
end;
$$;

revoke all on function public.list_staff_users() from public;
grant execute on function public.list_staff_users() to authenticated, service_role;

-- Always apply position from bind form (null clears).
create or replace function public.bind_staff_to_company(
  p_user_id uuid,
  p_company_id uuid,
  p_position text default null,
  p_is_primary boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep public.representatives;
  v_email text;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_make_primary boolean := coalesce(p_is_primary, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' then
    raise exception 'Сотрудник заблокирован' using errcode = 'P0001';
  end if;

  -- Already linked: move or refresh representative for the target company.
  if v_user.representative_id is not null then
    select * into v_rep
    from public.representatives
    where id = v_user.representative_id
    for update;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
        is_active = true,
        position = v_position,
        full_name = coalesce(
          nullif(trim(coalesce(v_user.full_name, '')), ''),
          full_name
        )
      where id = v_rep.id
      returning * into v_rep;

      update public.users
      set status = 'confirmed'
      where id = p_user_id
        and status is distinct from 'confirmed';

      select * into v_user from public.users where id = p_user_id;

      if v_make_primary and v_rep.is_active then
        perform public.set_primary_representative(v_rep.id);
      end if;

      return v_user;
    end if;

    update public.users set representative_id = null where id = p_user_id;
    v_user.representative_id := null;
  end if;

  v_email := nullif(lower(trim(coalesce(v_user.email, ''))), '');

  select null::public.representatives into v_rep;

  if v_email is not null then
    select r.* into v_rep
    from public.representatives r
    where lower(trim(coalesce(r.email, ''))) = v_email
      and not exists (
        select 1 from public.users u where u.representative_id = r.id
      )
    order by case when r.company_id = p_company_id then 0 else 1 end, r.created_at asc
    limit 1
    for update of r;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
        is_active = true,
        position = v_position,
        full_name = coalesce(
          nullif(trim(coalesce(v_user.full_name, '')), ''),
          full_name
        ),
        email = coalesce(v_email, email)
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_rep.id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(
        nullif(trim(coalesce(v_user.full_name, '')), ''),
        split_part(v_user.email, '@', 1)
      ),
      v_position,
      null,
      v_email,
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;
  end if;

  update public.users
  set
    representative_id = v_rep.id,
    status = 'confirmed'
  where id = p_user_id
  returning * into v_user;

  if v_make_primary and v_rep.is_active then
    perform public.set_primary_representative(v_rep.id);
  end if;

  return v_user;
end;
$$;

revoke all on function public.bind_staff_to_company(uuid, uuid, text, boolean) from public;
grant execute on function public.bind_staff_to_company(uuid, uuid, text, boolean) to authenticated, service_role;

-- =============================================================================
-- END 20260715000058_staff_company_position.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000059_admin_own_profile.sql
-- =============================================================================

-- Allow staff (admin) to update their own profile; dual-role with company uses representative.

create or replace function public.update_own_member_profile(
  p_full_name text,
  p_position text default null,
  p_phone text default null,
  p_telegram_username text default null,
  p_max_username text default null,
  p_show_contacts_to_members boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_full_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_telegram text := nullif(ltrim(trim(coalesce(p_telegram_username, '')), '@'), '');
  v_max text := nullif(ltrim(trim(coalesce(p_max_username, '')), '@'), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_full_name is null then
    raise exception 'full_name_required' using errcode = 'P0001';
  end if;

  select * into v_user
  from public.users
  where id = auth.uid()
  for update;

  if not found or v_user.status = 'blocked' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.role = 'member' then
    if v_user.status <> 'confirmed' or v_user.representative_id is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif v_user.role = 'admin' then
    null;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is not null then
    update public.representatives
    set
      full_name = v_full_name,
      position = v_position,
      phone = v_phone,
      telegram_username = v_telegram,
      max_username = v_max,
      show_contacts_to_members = coalesce(p_show_contacts_to_members, false)
    where id = v_user.representative_id
      and is_active is true;

    if not found then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;
  end if;

  update public.users
  set
    full_name = v_full_name,
    phone = v_phone,
    telegram_username = v_telegram,
    max_username = v_max,
    show_contacts_to_members = coalesce(p_show_contacts_to_members, false)
  where id = auth.uid()
  returning * into v_user;

  return v_user;
end;
$$;

revoke all on function public.update_own_member_profile(
  text, text, text, text, text, boolean
) from public;
grant execute on function public.update_own_member_profile(
  text, text, text, text, text, boolean
) to authenticated;

-- =============================================================================
-- END 20260715000059_admin_own_profile.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000060_demote_reuse_representative.sql
-- =============================================================================

-- Reuse existing representative on staff demote / bind instead of creating duplicates.
-- Typical case: member → staff (representative_id cleared) → bind as staff → demote
-- leaves the original orphan representative plus a newly inserted one.

create or replace function public.demote_from_staff(
  p_user_id uuid,
  p_company_id uuid,
  p_position text default null,
  p_is_primary boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_rep public.representatives;
  v_prev_rep_id uuid;
  v_email text;
  v_full_name text;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_make_primary boolean := coalesce(p_is_primary, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Нельзя снять статус с собственной учётной записи' using errcode = 'P0001';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  if coalesce(v_user.is_ceo, false) then
    if not coalesce(v_actor.is_ceo, false) then
      raise exception 'Снять статус с гендиректора может только гендиректор' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.users u
      where u.role = 'admin'
        and u.is_ceo is true
        and u.status is distinct from 'blocked'
        and u.id <> v_user.id
    ) then
      raise exception 'Нельзя снять статус с единственного гендиректора' using errcode = 'P0001';
    end if;
  end if;

  v_prev_rep_id := v_user.representative_id;
  v_email := nullif(lower(trim(coalesce(v_user.email, ''))), '');
  v_full_name := nullif(trim(coalesce(v_user.full_name, '')), '');

  select null::public.representatives into v_rep;

  -- Prefer an orphan representative already in the target company (email, then full name).
  select r.* into v_rep
  from public.representatives r
  where r.company_id = p_company_id
    and not exists (
      select 1 from public.users u where u.representative_id = r.id
    )
    and (
      (v_email is not null and lower(trim(coalesce(r.email, ''))) = v_email)
      or (
        v_full_name is not null
        and lower(trim(coalesce(r.full_name, ''))) = lower(v_full_name)
      )
    )
  order by
    case
      when v_email is not null and lower(trim(coalesce(r.email, ''))) = v_email then 0
      else 1
    end,
    r.is_primary desc,
    r.created_at asc
  limit 1
  for update of r;

  if found then
    update public.representatives
    set
      company_id = p_company_id,
      is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
      is_active = true,
      position = coalesce(v_position, position),
      full_name = coalesce(v_full_name, full_name),
      email = coalesce(v_email, email)
    where id = v_rep.id
    returning * into v_rep;
  else
    -- Reuse representative already linked to this staff account (dual-role bind).
    if v_prev_rep_id is not null then
      select * into v_rep
      from public.representatives
      where id = v_prev_rep_id
      for update;

      if found then
        update public.representatives
        set
          company_id = p_company_id,
          is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
          is_active = true,
          position = coalesce(v_position, position),
          full_name = coalesce(v_full_name, full_name),
          email = coalesce(v_email, email)
        where id = v_rep.id
        returning * into v_rep;
      end if;
    end if;

    -- Fallback: orphan with the same email in any company.
    if v_rep.id is null and v_email is not null then
      select r.* into v_rep
      from public.representatives r
      where lower(trim(coalesce(r.email, ''))) = v_email
        and not exists (
          select 1 from public.users u where u.representative_id = r.id
        )
      order by case when r.company_id = p_company_id then 0 else 1 end, r.created_at asc
      limit 1
      for update of r;

      if found then
        update public.representatives
        set
          company_id = p_company_id,
          is_primary = false,
          is_active = true,
          position = coalesce(v_position, position),
          full_name = coalesce(v_full_name, full_name),
          email = coalesce(v_email, email)
        where id = v_rep.id
        returning * into v_rep;
      end if;
    end if;
  end if;

  if v_rep.id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(v_full_name, split_part(v_user.email, '@', 1)),
      v_position,
      null,
      v_email,
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;
  end if;

  update public.users
  set
    role = 'member',
    status = 'confirmed',
    representative_id = v_rep.id,
    staff_position = null,
    is_ceo = false,
    can_manage_work_groups = false
  where id = p_user_id
  returning * into v_user;

  -- Deactivate a stale bind-created representative left without a user link.
  if v_prev_rep_id is not null and v_prev_rep_id <> v_rep.id then
    update public.representatives
    set
      is_active = false,
      is_primary = false
    where id = v_prev_rep_id
      and not exists (
        select 1 from public.users u where u.representative_id = v_prev_rep_id
      );
  end if;

  if v_make_primary and v_rep.is_active then
    perform public.set_primary_representative(v_rep.id);
  end if;

  return v_user;
end;
$$;

revoke all on function public.demote_from_staff(uuid, uuid, text, boolean) from public;
grant execute on function public.demote_from_staff(uuid, uuid, text, boolean) to authenticated, service_role;

create or replace function public.bind_staff_to_company(
  p_user_id uuid,
  p_company_id uuid,
  p_position text default null,
  p_is_primary boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep public.representatives;
  v_email text;
  v_full_name text;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_make_primary boolean := coalesce(p_is_primary, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' then
    raise exception 'Сотрудник заблокирован' using errcode = 'P0001';
  end if;

  v_email := nullif(lower(trim(coalesce(v_user.email, ''))), '');
  v_full_name := nullif(trim(coalesce(v_user.full_name, '')), '');

  -- Already linked: move or refresh representative for the target company.
  if v_user.representative_id is not null then
    select * into v_rep
    from public.representatives
    where id = v_user.representative_id
    for update;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
        is_active = true,
        position = v_position,
        full_name = coalesce(v_full_name, full_name)
      where id = v_rep.id
      returning * into v_rep;

      update public.users
      set status = 'confirmed'
      where id = p_user_id
        and status is distinct from 'confirmed';

      select * into v_user from public.users where id = p_user_id;

      if v_make_primary and v_rep.is_active then
        perform public.set_primary_representative(v_rep.id);
      end if;

      return v_user;
    end if;

    update public.users set representative_id = null where id = p_user_id;
    v_user.representative_id := null;
  end if;

  select null::public.representatives into v_rep;

  if v_email is not null then
    select r.* into v_rep
    from public.representatives r
    where lower(trim(coalesce(r.email, ''))) = v_email
      and not exists (
        select 1 from public.users u where u.representative_id = r.id
      )
    order by case when r.company_id = p_company_id then 0 else 1 end, r.created_at asc
    limit 1
    for update of r;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
        is_active = true,
        position = v_position,
        full_name = coalesce(v_full_name, full_name),
        email = coalesce(v_email, email)
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_rep.id is null and v_full_name is not null then
    select r.* into v_rep
    from public.representatives r
    where r.company_id = p_company_id
      and not exists (
        select 1 from public.users u where u.representative_id = r.id
      )
      and lower(trim(coalesce(r.full_name, ''))) = lower(v_full_name)
    order by r.is_primary desc, r.created_at asc
    limit 1
    for update of r;

    if found then
      update public.representatives
      set
        company_id = p_company_id,
        is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
        is_active = true,
        position = v_position,
        full_name = coalesce(v_full_name, full_name),
        email = coalesce(v_email, email)
      where id = v_rep.id
      returning * into v_rep;
    end if;
  end if;

  if v_rep.id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(v_full_name, split_part(v_user.email, '@', 1)),
      v_position,
      null,
      v_email,
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;
  end if;

  update public.users
  set
    representative_id = v_rep.id,
    status = 'confirmed'
  where id = p_user_id
  returning * into v_user;

  if v_make_primary and v_rep.is_active then
    perform public.set_primary_representative(v_rep.id);
  end if;

  return v_user;
end;
$$;

revoke all on function public.bind_staff_to_company(uuid, uuid, text, boolean) from public;
grant execute on function public.bind_staff_to_company(uuid, uuid, text, boolean) to authenticated, service_role;

-- =============================================================================
-- END 20260715000060_demote_reuse_representative.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000061_unlink_representative_from_user.sql
-- =============================================================================

-- Unlink a user account from a representative (keep the representative contact row).

create or replace function public.unlink_representative_from_user(
  p_representative_id uuid
)
returns public.representatives
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep public.representatives;
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_representative_id is null then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_rep
  from public.representatives
  where id = p_representative_id;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_user
  from public.users
  where representative_id = p_representative_id
  for update;

  if not found then
    raise exception 'Представитель не привязан к учётной записи' using errcode = 'P0001';
  end if;

  update public.users
  set representative_id = null
  where id = v_user.id;

  return v_rep;
end;
$$;

revoke all on function public.unlink_representative_from_user(uuid) from public;
grant execute on function public.unlink_representative_from_user(uuid) to authenticated, service_role;

-- =============================================================================
-- END 20260715000061_unlink_representative_from_user.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000062_remove_representative_from_company.sql
-- =============================================================================

-- Remove representative from company (delete contact row).
-- Linked user account is kept; users.representative_id is cleared via FK on delete set null.

drop function if exists public.unlink_representative_from_user(uuid);

create or replace function public.remove_representative_from_company(
  p_representative_id uuid
)
returns table (
  company_id uuid,
  company_name text,
  full_name text,
  linked_user_id uuid
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep public.representatives;
  v_company public.companies;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_representative_id is null then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_rep
  from public.representatives
  where id = p_representative_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_company from public.companies where id = v_rep.company_id;

  select u.id into v_user_id
  from public.users u
  where u.representative_id = v_rep.id;

  company_id := v_rep.company_id;
  company_name := coalesce(v_company.name, '');
  full_name := v_rep.full_name;
  linked_user_id := v_user_id;

  delete from public.representatives where id = v_rep.id;

  return next;
end;
$$;

revoke all on function public.remove_representative_from_company(uuid) from public;
grant execute on function public.remove_representative_from_company(uuid) to authenticated, service_role;

-- Staff unbind should also remove the company contact, not leave an orphan row.
create or replace function public.unbind_staff_from_company(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  v_rep_id := v_user.representative_id;

  update public.users
  set representative_id = null
  where id = p_user_id
  returning * into v_user;

  if v_rep_id is not null then
    delete from public.representatives
    where id = v_rep_id
      and not exists (
        select 1 from public.users u where u.representative_id = v_rep_id
      );
  end if;

  return v_user;
end;
$$;

revoke all on function public.unbind_staff_from_company(uuid) from public;
grant execute on function public.unbind_staff_from_company(uuid) to authenticated, service_role;

-- =============================================================================
-- END 20260715000062_remove_representative_from_company.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000063_message_relay_dedup.sql
-- =============================================================================

-- One relay attempt per (message, target platform) — prevents duplicate Telegram/Max sends on webhook retry.

delete from public.message_relays r
using public.message_relays r2
where r.message_id = r2.message_id
  and r.target_platform = r2.target_platform
  and (
    case r.status when 'sent' then 0 when 'pending' then 1 else 2 end
    > case r2.status when 'sent' then 0 when 'pending' then 1 else 2 end
    or (
      case r.status when 'sent' then 0 when 'pending' then 1 else 2 end
      = case r2.status when 'sent' then 0 when 'pending' then 1 else 2 end
      and r.created_at > r2.created_at
    )
  );

create unique index if not exists message_relays_message_target_platform_idx
  on public.message_relays (message_id, target_platform);

-- =============================================================================
-- END 20260715000063_message_relay_dedup.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000064_fix_moderation_pending_notifications.sql
-- =============================================================================

-- Notify admins when moderation_status becomes pending, including changes made by BEFORE triggers.
-- "UPDATE OF moderation_status" only fires when the column is in the client SET list;
-- protect_company_product_moderation sets pending in BEFORE UPDATE without that.

create or replace function public.trg_notify_admins_product_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_name text;
begin
  if new.moderation_status is distinct from 'pending'::public.product_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.product_moderation_status then
    return new;
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = new.company_id;

  perform public.notify_admins(
    'product_moderation_pending'::public.notification_type,
    'Продукция на модерации',
    format(
      '«%s» — %s',
      coalesce(nullif(btrim(new.name), ''), 'Без названия'),
      coalesce(v_company_name, 'компания')
    ),
    '/admin/registrations',
    'company_products',
    new.id,
    new.company_id,
    jsonb_build_object('name', new.name, 'company_id', new.company_id)
  );

  return new;
end;
$$;

drop trigger if exists company_products_notify_admins_pending on public.company_products;
create trigger company_products_notify_admins_pending
after insert or update on public.company_products
for each row
execute function public.trg_notify_admins_product_pending();

-- Same pattern for material moderation queues.
create or replace function public.trg_notify_admins_material_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.moderation_status is distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  perform public.notify_admins(
    'material_moderation_pending'::public.notification_type,
    'Материал на модерации',
    format('«%s»', coalesce(nullif(btrim(new.title), ''), 'Без названия')),
    '/admin/registrations',
    'material_sections',
    new.id,
    null,
    jsonb_build_object('title', new.title, 'slug', new.slug)
  );

  return new;
end;
$$;

drop trigger if exists material_sections_notify_admins_pending on public.material_sections;
create trigger material_sections_notify_admins_pending
after insert or update on public.material_sections
for each row
execute function public.trg_notify_admins_material_pending();

create or replace function public.trg_notify_admins_material_category_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.moderation_status is distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  perform public.notify_admins(
    'material_category_pending'::public.notification_type,
    'Категория материала на модерации',
    format('«%s»', coalesce(nullif(btrim(new.name), ''), 'Без названия')),
    '/admin/registrations',
    'material_categories',
    new.id,
    null,
    jsonb_build_object('name', new.name)
  );

  return new;
end;
$$;

drop trigger if exists material_categories_notify_admins_pending on public.material_categories;
create trigger material_categories_notify_admins_pending
after insert or update on public.material_categories
for each row
execute function public.trg_notify_admins_material_category_pending();

-- =============================================================================
-- END 20260715000064_fix_moderation_pending_notifications.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000065_work_group_responsible_links.sql
-- =============================================================================

-- Responsible representative (not necessarily APSS staff) may manage group links and files.

-- -----------------------------------------------------------------------------
-- Helper: current user is the group's responsible representative
-- -----------------------------------------------------------------------------

create or replace function public.is_work_group_responsible(p_work_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.work_groups wg
    join public.users u on u.representative_id = wg.responsible_representative_id
    where wg.id = p_work_group_id
      and wg.responsible_representative_id is not null
      and u.id = auth.uid()
      and public.is_confirmed_member()
  );
$$;

revoke all on function public.is_work_group_responsible(uuid) from public;
grant execute on function public.is_work_group_responsible(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- work_group_links: responsible may read (even if not a member) and write
-- -----------------------------------------------------------------------------

drop policy if exists work_group_links_member_read on public.work_group_links;
create policy work_group_links_member_read
on public.work_group_links for select to authenticated
using (
  public.is_admin()
  or public.member_belongs_to_work_group(work_group_id)
  or public.is_work_group_responsible(work_group_id)
);

drop policy if exists work_group_links_responsible_insert on public.work_group_links;
create policy work_group_links_responsible_insert
on public.work_group_links for insert to authenticated
with check (public.is_work_group_responsible(work_group_id));

drop policy if exists work_group_links_responsible_update on public.work_group_links;
create policy work_group_links_responsible_update
on public.work_group_links for update to authenticated
using (public.is_work_group_responsible(work_group_id))
with check (public.is_work_group_responsible(work_group_id));

drop policy if exists work_group_links_responsible_delete on public.work_group_links;
create policy work_group_links_responsible_delete
on public.work_group_links for delete to authenticated
using (public.is_work_group_responsible(work_group_id));

-- -----------------------------------------------------------------------------
-- Storage work-group-files: responsible upload / delete / read
-- -----------------------------------------------------------------------------

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
        and (
          public.member_belongs_to_work_group(l.work_group_id)
          or public.is_work_group_responsible(l.work_group_id)
        )
    )
  )
);

drop policy if exists work_group_files_responsible_insert on storage.objects;
create policy work_group_files_responsible_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_groups wg
    where wg.responsible_representative_id = public.current_representative_id()
      and public.is_confirmed_member()
      and name like wg.id::text || '/%'
  )
);

drop policy if exists work_group_files_responsible_update on storage.objects;
create policy work_group_files_responsible_update
on storage.objects for update to authenticated
using (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_group_links l
    where l.file_url = name
      and public.is_work_group_responsible(l.work_group_id)
  )
)
with check (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_group_links l
    where l.file_url = name
      and public.is_work_group_responsible(l.work_group_id)
  )
);

drop policy if exists work_group_files_responsible_delete on storage.objects;
create policy work_group_files_responsible_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_group_links l
    where l.file_url = name
      and public.is_work_group_responsible(l.work_group_id)
  )
);

-- -----------------------------------------------------------------------------
-- Reorder RPC: admins and responsible representatives
-- -----------------------------------------------------------------------------

create or replace function public.reorder_work_group_links(
  p_work_group_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.work_group_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_index integer := 0;
begin
  if not (
    public.is_admin()
    or public.is_work_group_responsible(p_work_group_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.work_groups where id = p_work_group_id) then
    raise exception 'work_group_not_found' using errcode = 'P0002';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.work_group_links
    set sort_order = v_index
    where id = v_id
      and work_group_id = p_work_group_id;

    if not found then
      raise exception 'link_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  update public.work_groups
  set updated_at = now()
  where id = p_work_group_id;

  return query
    select *
    from public.work_group_links
    where work_group_id = p_work_group_id
    order by sort_order asc, title asc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cabinet list: expose is_responsible
-- -----------------------------------------------------------------------------

drop function if exists public.list_cabinet_work_groups();

create or replace function public.list_cabinet_work_groups()
returns table (
  id uuid,
  name text,
  description text,
  status public.work_group_status,
  category_id uuid,
  category_name text,
  is_member boolean,
  is_responsible boolean,
  joined_at timestamptz,
  pending_request_id uuid,
  pending_request_kind public.work_group_membership_request_kind,
  pending_request_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep_id uuid;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_rep_id := public.current_representative_id();

  return query
  select
    wg.id,
    wg.name,
    wg.description,
    wg.status,
    wg.category_id,
    cat.name as category_name,
    (wgm.id is not null) as is_member,
    (
      wg.responsible_representative_id is not null
      and wg.responsible_representative_id = v_rep_id
    ) as is_responsible,
    wgm.created_at as joined_at,
    req.id as pending_request_id,
    req.kind as pending_request_kind,
    req.created_at as pending_request_at
  from public.work_groups wg
  left join public.work_group_categories cat on cat.id = wg.category_id
  left join public.work_group_members wgm
    on wgm.work_group_id = wg.id
   and wgm.representative_id = v_rep_id
  left join public.work_group_membership_requests req
    on req.work_group_id = wg.id
   and req.representative_id = v_rep_id
   and req.status = 'pending'::public.work_group_membership_request_status
  where wg.status is distinct from 'archived'
  order by
    (wgm.id is not null) desc,
    (wg.responsible_representative_id is not null and wg.responsible_representative_id = v_rep_id) desc,
    cat.name nulls last,
    wg.name;
end;
$$;

revoke all on function public.list_cabinet_work_groups() from public;
grant execute on function public.list_cabinet_work_groups() to authenticated, service_role;

-- =============================================================================
-- END 20260715000065_work_group_responsible_links.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000066_participation_level_resource_access.sql
-- =============================================================================

-- Per-participation-level cabinet resource access: separate visibility vs content by company status.

-- -----------------------------------------------------------------------------
-- Types + table
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cabinet_resource') then
    create type public.cabinet_resource as enum (
      'directory',
      'products',
      'materials',
      'polls',
      'work_groups',
      'invoices'
    );
  end if;
end
$$;

create table if not exists public.participation_level_resource_access (
  participation_level_id uuid not null
    references public.participation_levels (id) on delete cascade,
  resource public.cabinet_resource not null,
  visibility_statuses public.company_access_status[] not null,
  content_statuses public.company_access_status[] not null,
  primary key (participation_level_id, resource),
  constraint participation_level_resource_access_visibility_not_empty
    check (cardinality(visibility_statuses) >= 1),
  constraint participation_level_resource_access_content_not_empty
    check (cardinality(content_statuses) >= 1)
);

alter table public.participation_level_resource_access enable row level security;

drop policy if exists participation_level_resource_access_admin_all
  on public.participation_level_resource_access;
create policy participation_level_resource_access_admin_all
on public.participation_level_resource_access for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Seed defaults for existing levels: visible for active+suspended, content for active only.
insert into public.participation_level_resource_access (
  participation_level_id,
  resource,
  visibility_statuses,
  content_statuses
)
select
  pl.id,
  r.resource,
  array['active', 'suspended']::public.company_access_status[],
  array['active']::public.company_access_status[]
from public.participation_levels pl
cross join (
  values
    ('directory'::public.cabinet_resource),
    ('products'::public.cabinet_resource),
    ('materials'::public.cabinet_resource),
    ('polls'::public.cabinet_resource),
    ('work_groups'::public.cabinet_resource),
    ('invoices'::public.cabinet_resource)
) as r(resource)
on conflict (participation_level_id, resource) do nothing;

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
    array['active', 'suspended']::public.company_access_status[],
    array['active']::public.company_access_status[]
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

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.current_company_access_status()
returns public.company_access_status
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
          public.current_company_access_status() in ('active', 'suspended')
        when p_kind = 'content' then
          public.current_company_access_status() = 'active'
        else false
      end
    );
$$;

-- Level id for ACL joins regardless of company status (resource rules gate access).
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
    and u.representative_id is not null
    and (
      (u.role = 'member' and u.status = 'confirmed')
      or (u.role = 'admin' and u.status is distinct from 'blocked')
    )
  limit 1;
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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
      and public.member_cabinet_resource_allowed('materials'::public.cabinet_resource, 'content')
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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
      and public.member_cabinet_resource_allowed('polls'::public.cabinet_resource, 'content')
      and c.participation_level_id is not null
      and pla.participation_level_id = c.participation_level_id
  );
$$;

revoke all on function public.current_company_access_status() from public;
grant execute on function public.current_company_access_status() to authenticated, service_role;

revoke all on function public.member_cabinet_resource_allowed(public.cabinet_resource, text) from public;
grant execute on function public.member_cabinet_resource_allowed(public.cabinet_resource, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Cabinet + admin RPCs
-- -----------------------------------------------------------------------------

create or replace function public.get_cabinet_resource_access()
returns table (
  resource public.cabinet_resource,
  visible boolean,
  has_content boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.cabinet_resource;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  foreach r in array array[
    'directory'::public.cabinet_resource,
    'products'::public.cabinet_resource,
    'materials'::public.cabinet_resource,
    'polls'::public.cabinet_resource,
    'work_groups'::public.cabinet_resource,
    'invoices'::public.cabinet_resource
  ]
  loop
    resource := r;
    visible := public.member_cabinet_resource_allowed(r, 'visibility');
    has_content := public.member_cabinet_resource_allowed(r, 'content');
    return next;
  end loop;
end;
$$;

create or replace function public.get_participation_level_resource_access(p_level_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.participation_levels where id = p_level_id) then
    raise exception 'level_not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'resource', plra.resource,
      'visibility_statuses', to_jsonb(plra.visibility_statuses),
      'content_statuses', to_jsonb(plra.content_statuses)
    )
    order by plra.resource::text
  ), '[]'::jsonb)
  into v_result
  from public.participation_level_resource_access plra
  where plra.participation_level_id = p_level_id;

  return v_result;
end;
$$;

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
  v_visibility public.company_access_status[];
  v_content public.company_access_status[];
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
      select jsonb_array_elements_text(v_row->'visibility_statuses')::public.company_access_status
    );
    v_content := array(
      select jsonb_array_elements_text(v_row->'content_statuses')::public.company_access_status
    );

    if cardinality(v_visibility) < 1 or cardinality(v_content) < 1 then
      raise exception 'statuses_required' using errcode = 'P0001';
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

revoke all on function public.get_cabinet_resource_access() from public;
grant execute on function public.get_cabinet_resource_access() to authenticated, service_role;

revoke all on function public.get_participation_level_resource_access(uuid) from public;
grant execute on function public.get_participation_level_resource_access(uuid) to authenticated, service_role;

revoke all on function public.set_participation_level_resource_access(uuid, jsonb) from public;
grant execute on function public.set_participation_level_resource_access(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS: products + invoices
-- -----------------------------------------------------------------------------

drop policy if exists company_products_select_own_member on public.company_products;
create policy company_products_select_own_member
on public.company_products for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists company_products_insert_own_member on public.company_products;
create policy company_products_insert_own_member
on public.company_products for insert to authenticated
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists company_products_update_own_member on public.company_products;
create policy company_products_update_own_member
on public.company_products for update to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
)
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists company_products_delete_own_member on public.company_products;
create policy company_products_delete_own_member
on public.company_products for delete to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read
on public.invoices for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('invoices'::public.cabinet_resource, 'content')
  and status in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  )
);

-- Directory: empty payload when content access is denied.
create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not v_is_admin
     and not public.member_cabinet_resource_allowed('directory'::public.cabinet_resource, 'content') then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.phone
              else null
            end,
            'email', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order,
            'category_id', p.category_id,
            'category_name', pc.name,
            'okpd_code_id', p.okpd_code_id,
            'okpd_code', oc.code,
            'okpd_title', oc.title,
            'note_id', p.note_id,
            'note_name', pn.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
        left join public.okpd2_codes oc on oc.id = p.okpd_code_id
        left join public.product_notes pn on pn.id = p.note_id
        where p.company_id = c.id
          and p.is_active is true
          and p.moderation_status = 'approved'
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- Work group links read: require work_groups content access for members (admins/responsible unchanged).
drop policy if exists work_group_links_member_read on public.work_group_links;
create policy work_group_links_member_read
on public.work_group_links for select to authenticated
using (
  public.is_admin()
  or public.is_work_group_responsible(work_group_id)
  or (
    public.member_belongs_to_work_group(work_group_id)
    and public.member_cabinet_resource_allowed('work_groups'::public.cabinet_resource, 'content')
  )
);

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
        and (
          public.is_work_group_responsible(l.work_group_id)
          or (
            public.member_belongs_to_work_group(l.work_group_id)
            and public.member_cabinet_resource_allowed('work_groups'::public.cabinet_resource, 'content')
          )
        )
    )
  )
);

-- =============================================================================
-- END 20260715000066_participation_level_resource_access.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000067_cabinet_work_groups_filters.sql
-- =============================================================================

-- Cabinet work groups list: include archived so status filter matches admin panel.

drop function if exists public.list_cabinet_work_groups();

create or replace function public.list_cabinet_work_groups()
returns table (
  id uuid,
  name text,
  description text,
  status public.work_group_status,
  category_id uuid,
  category_name text,
  is_member boolean,
  is_responsible boolean,
  joined_at timestamptz,
  pending_request_id uuid,
  pending_request_kind public.work_group_membership_request_kind,
  pending_request_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep_id uuid;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_rep_id := public.current_representative_id();

  return query
  select
    wg.id,
    wg.name,
    wg.description,
    wg.status,
    wg.category_id,
    cat.name as category_name,
    (wgm.id is not null) as is_member,
    (
      wg.responsible_representative_id is not null
      and wg.responsible_representative_id = v_rep_id
    ) as is_responsible,
    wgm.created_at as joined_at,
    req.id as pending_request_id,
    req.kind as pending_request_kind,
    req.created_at as pending_request_at
  from public.work_groups wg
  left join public.work_group_categories cat on cat.id = wg.category_id
  left join public.work_group_members wgm
    on wgm.work_group_id = wg.id
   and wgm.representative_id = v_rep_id
  left join public.work_group_membership_requests req
    on req.work_group_id = wg.id
   and req.representative_id = v_rep_id
   and req.status = 'pending'::public.work_group_membership_request_status
  order by
    (wgm.id is not null) desc,
    (wg.responsible_representative_id is not null and wg.responsible_representative_id = v_rep_id) desc,
    cat.name nulls last,
    wg.name;
end;
$$;

revoke all on function public.list_cabinet_work_groups() from public;
grant execute on function public.list_cabinet_work_groups() to authenticated, service_role;

-- =============================================================================
-- END 20260715000067_cabinet_work_groups_filters.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000068_admin_user_management.sql
-- =============================================================================

-- Admin user management: update profile/email/password and full delete via auth.users.

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_phone text default null,
  p_status public.user_status default null,
  p_role public.user_role default null,
  p_password text default null,
  p_staff_position text default null,
  p_is_ceo boolean default null,
  p_can_manage_work_groups boolean default null,
  p_company_name_hint text default null,
  p_company_inn_hint text default null
)
returns public.users
language plpgsql
security definer
set search_path = public, auth, extensions
set row_security = off
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if p_email is not null then
    v_email := lower(trim(p_email));
    if v_email = '' or position('@' in v_email) = 0 then
      raise exception 'invalid_email' using errcode = 'P0001';
    end if;

    if v_email <> v_user.email then
      if exists (
        select 1
        from public.users u
        where lower(u.email) = v_email
          and u.id <> p_user_id
      ) then
        raise exception 'email_already_used' using errcode = 'P0001';
      end if;

      update auth.users
      set
        email = v_email,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
      where id = p_user_id;

      update auth.identities
      set
        identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)),
        updated_at = now()
      where user_id = p_user_id
        and provider = 'email';
    end if;
  end if;

  if p_password is not null then
    if length(p_password) < 8 then
      raise exception 'password_too_short' using errcode = 'P0001';
    end if;

    update auth.users
    set
      encrypted_password = crypt(p_password, gen_salt('bf')),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null and p_role is distinct from v_user.role then
    if p_role = 'admin' then
      update public.users
      set
        role = 'admin',
        status = case when status = 'pending' then 'confirmed'::public.user_status else status end,
        representative_id = null
      where id = p_user_id
      returning * into v_user;
    else
      if coalesce(v_user.is_ceo, false) then
        if not exists (
          select 1
          from public.users u
          where u.role = 'admin'
            and u.is_ceo is true
            and u.status is distinct from 'blocked'
            and u.id <> v_user.id
        ) then
          raise exception 'cannot_remove_last_ceo' using errcode = 'P0001';
        end if;
      end if;

      update public.users
      set
        role = 'member',
        is_ceo = false,
        staff_position = null,
        can_manage_work_groups = true
      where id = p_user_id
      returning * into v_user;
    end if;
  end if;

  if p_status is not null and p_status is distinct from v_user.status then
    if v_user.role = 'admin' then
      if p_status = 'pending' then
        raise exception 'invalid_status_for_staff' using errcode = 'P0001';
      end if;

      if p_user_id = auth.uid() then
        raise exception 'cannot_change_own_status' using errcode = 'P0001';
      end if;

      if coalesce(v_user.is_ceo, false) and p_status = 'blocked' then
        raise exception 'cannot_block_ceo' using errcode = 'P0001';
      end if;
    else
      if p_status = 'confirmed' and v_user.representative_id is null then
        raise exception 'representative_required_for_confirm' using errcode = 'P0001';
      end if;

      if p_status = 'confirmed' and v_user.status = 'pending' then
        raise exception 'use_confirm_registration_for_pending' using errcode = 'P0001';
      end if;
    end if;

    update public.users
    set status = p_status
    where id = p_user_id
    returning * into v_user;
  end if;

  if v_user.role = 'admin' and p_is_ceo is not null and p_is_ceo is distinct from v_user.is_ceo then
    if not coalesce(v_actor.is_ceo, false) then
      raise exception 'only_ceo_can_change_ceo_flag' using errcode = 'P0001';
    end if;

    if v_user.id = v_actor.id and p_is_ceo is false then
      if not exists (
        select 1
        from public.users u
        where u.role = 'admin'
          and u.is_ceo is true
          and u.status is distinct from 'blocked'
          and u.id <> v_user.id
      ) then
        raise exception 'cannot_remove_last_ceo' using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.users
  set
    email = coalesce(v_email, email),
    full_name = case
      when p_full_name is null then full_name
      else nullif(trim(p_full_name), '')
    end,
    phone = case
      when p_phone is null then phone
      else nullif(trim(p_phone), '')
    end,
    staff_position = case
      when p_staff_position is null then staff_position
      when role = 'admin' then nullif(trim(p_staff_position), '')
      else null
    end,
    is_ceo = case
      when role = 'admin' then coalesce(p_is_ceo, is_ceo)
      else false
    end,
    can_manage_work_groups = case
      when role = 'admin' then coalesce(p_can_manage_work_groups, can_manage_work_groups)
      else true
    end,
    company_name_hint = case
      when p_company_name_hint is null then company_name_hint
      when role = 'member' then nullif(trim(p_company_name_hint), '')
      else company_name_hint
    end,
    company_inn_hint = case
      when p_company_inn_hint is null then company_inn_hint
      when role = 'member' then nullif(trim(p_company_inn_hint), '')
      else company_inn_hint
    end
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
set row_security = off
as $$
declare
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot_delete_self' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if coalesce(v_user.is_ceo, false) then
    if not exists (
      select 1
      from public.users u
      where u.role = 'admin'
        and u.is_ceo is true
        and u.status is distinct from 'blocked'
        and u.id <> v_user.id
    ) then
      raise exception 'cannot_delete_last_ceo' using errcode = 'P0001';
    end if;
  end if;

  delete from public.company_comments where author_id = p_user_id;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_update_user(
  uuid, text, text, text, public.user_status, public.user_role, text, text, boolean, boolean, text, text
) from public;
grant execute on function public.admin_update_user(
  uuid, text, text, text, public.user_status, public.user_role, text, text, boolean, boolean, text, text
) to authenticated, service_role;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;

-- =============================================================================
-- END 20260715000068_admin_user_management.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000069_assign_candidates_include_staff.sql
-- =============================================================================

-- Include APSS staff (role=admin) in company assign candidate list.

drop function if exists public.list_member_assign_candidates(uuid, text);

create or replace function public.list_member_assign_candidates(
  p_company_id uuid,
  p_search text default null
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status public.user_status,
  user_role public.user_role,
  representative_id uuid,
  current_company_id uuid,
  current_company_name text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_term text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    u.id as user_id,
    u.email,
    u.full_name,
    u.status,
    u.role as user_role,
    r.id as representative_id,
    r.company_id as current_company_id,
    c.name as current_company_name
  from public.users u
  left join public.representatives r on r.id = u.representative_id
  left join public.companies c on c.id = r.company_id
  where u.status <> 'blocked'
    and (r.company_id is null or r.company_id <> p_company_id)
    and (
      v_term is null
      or u.email ilike '%' || v_term || '%'
      or coalesce(u.full_name, '') ilike '%' || v_term || '%'
      or coalesce(r.full_name, '') ilike '%' || v_term || '%'
    )
  order by u.role desc, coalesce(u.full_name, u.email)
  limit 80;
end;
$$;

revoke all on function public.list_member_assign_candidates(uuid, text) from public;
grant execute on function public.list_member_assign_candidates(uuid, text) to authenticated, service_role;

-- =============================================================================
-- END 20260715000069_assign_candidates_include_staff.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000070_demote_staff_without_company.sql
-- =============================================================================

-- Allow demoting APSS staff without binding to a company.

create or replace function public.demote_from_staff(
  p_user_id uuid,
  p_company_id uuid default null,
  p_position text default null,
  p_is_primary boolean default false
)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_rep public.representatives;
  v_prev_rep_id uuid;
  v_email text;
  v_full_name text;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_make_primary boolean := coalesce(p_is_primary, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Нельзя снять статус с собственной учётной записи' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'admin' then
    raise exception 'Пользователь не является сотрудником АПСС' using errcode = 'P0001';
  end if;

  if coalesce(v_user.is_ceo, false) then
    if not coalesce(v_actor.is_ceo, false) then
      raise exception 'Снять статус с гендиректора может только гендиректор' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.users u
      where u.role = 'admin'
        and u.is_ceo is true
        and u.status is distinct from 'blocked'
        and u.id <> v_user.id
    ) then
      raise exception 'Нельзя снять статус с единственного гендиректора' using errcode = 'P0001';
    end if;
  end if;

  v_prev_rep_id := v_user.representative_id;

  if p_company_id is null then
    update public.users
    set
      role = 'member',
      status = case when status = 'blocked' then status else 'confirmed' end,
      representative_id = null,
      staff_position = null,
      is_ceo = false,
      can_manage_work_groups = false
    where id = p_user_id
    returning * into v_user;

    if v_prev_rep_id is not null then
      update public.representatives
      set
        is_active = false,
        is_primary = false
      where id = v_prev_rep_id
        and not exists (
          select 1 from public.users u where u.representative_id = v_prev_rep_id
        );
    end if;

    return v_user;
  end if;

  if not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  v_email := nullif(lower(trim(coalesce(v_user.email, ''))), '');
  v_full_name := nullif(trim(coalesce(v_user.full_name, '')), '');

  select null::public.representatives into v_rep;

  select r.* into v_rep
  from public.representatives r
  where r.company_id = p_company_id
    and not exists (
      select 1 from public.users u where u.representative_id = r.id
    )
    and (
      (v_email is not null and lower(trim(coalesce(r.email, ''))) = v_email)
      or (
        v_full_name is not null
        and lower(trim(coalesce(r.full_name, ''))) = lower(v_full_name)
      )
    )
  order by
    case
      when v_email is not null and lower(trim(coalesce(r.email, ''))) = v_email then 0
      else 1
    end,
    r.is_primary desc,
    r.created_at asc
  limit 1
  for update of r;

  if found then
    update public.representatives
    set
      company_id = p_company_id,
      is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
      is_active = true,
      position = coalesce(v_position, position),
      full_name = coalesce(v_full_name, full_name),
      email = coalesce(v_email, email)
    where id = v_rep.id
    returning * into v_rep;
  else
    if v_prev_rep_id is not null then
      select * into v_rep
      from public.representatives
      where id = v_prev_rep_id
      for update;

      if found then
        update public.representatives
        set
          company_id = p_company_id,
          is_primary = case when v_rep.company_id = p_company_id then is_primary else false end,
          is_active = true,
          position = coalesce(v_position, position),
          full_name = coalesce(v_full_name, full_name),
          email = coalesce(v_email, email)
        where id = v_rep.id
        returning * into v_rep;
      end if;
    end if;

    if v_rep.id is null and v_email is not null then
      select r.* into v_rep
      from public.representatives r
      where lower(trim(coalesce(r.email, ''))) = v_email
        and not exists (
          select 1 from public.users u where u.representative_id = r.id
        )
      order by case when r.company_id = p_company_id then 0 else 1 end, r.created_at asc
      limit 1
      for update of r;

      if found then
        update public.representatives
        set
          company_id = p_company_id,
          is_primary = false,
          is_active = true,
          position = coalesce(v_position, position),
          full_name = coalesce(v_full_name, full_name),
          email = coalesce(v_email, email)
        where id = v_rep.id
        returning * into v_rep;
      end if;
    end if;
  end if;

  if v_rep.id is null then
    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active
    )
    values (
      p_company_id,
      coalesce(v_full_name, split_part(v_user.email, '@', 1)),
      v_position,
      null,
      v_email,
      true,
      now(),
      false,
      true
    )
    returning * into v_rep;
  end if;

  update public.users
  set
    role = 'member',
    status = 'confirmed',
    representative_id = v_rep.id,
    staff_position = null,
    is_ceo = false,
    can_manage_work_groups = false
  where id = p_user_id
  returning * into v_user;

  if v_prev_rep_id is not null and v_prev_rep_id <> v_rep.id then
    update public.representatives
    set
      is_active = false,
      is_primary = false
    where id = v_prev_rep_id
      and not exists (
        select 1 from public.users u where u.representative_id = v_prev_rep_id
      );
  end if;

  if v_make_primary and v_rep.is_active then
    perform public.set_primary_representative(v_rep.id);
  end if;

  return v_user;
end;
$$;

revoke all on function public.demote_from_staff(uuid, uuid, text, boolean) from public;
grant execute on function public.demote_from_staff(uuid, uuid, text, boolean) to authenticated, service_role;

-- =============================================================================
-- END 20260715000070_demote_staff_without_company.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000071_registration_position_hint.sql
-- =============================================================================

-- Registration: required job title hint on users, synced from auth metadata.

alter table public.users
  add column if not exists position_hint text;

comment on column public.users.position_hint is
  'Должность, указанная при регистрации; переносится в representatives.position при подтверждении.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    position_hint,
    company_name_hint,
    company_inn_hint,
    pd_consent_at,
    show_contacts_to_members,
    email_notifications_enabled,
    telegram_username,
    max_username
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'position_hint', '')), ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end,
    coalesce((new.raw_user_meta_data->>'show_contacts_to_members')::boolean, false),
    coalesce((new.raw_user_meta_data->>'email_notifications_enabled')::boolean, true),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'telegram_username', '')), '@'),
      ''
    ),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'max_username', '')), '@'),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.confirm_registration(
  p_user_id uuid,
  p_representative_id uuid default null,
  p_create_representative jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_rep_id uuid;
  v_company_id uuid;
  v_existing_link uuid;
  v_company_inn text;
  v_show_contacts boolean;
  v_telegram text;
  v_max text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user.role <> 'member' then
    raise exception 'only_members_can_be_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;

  if v_user.status = 'blocked' and v_user.representative_id is not null then
    raise exception 'use_set_user_status_to_unblock' using errcode = 'P0001';
  end if;

  if p_representative_id is not null and p_create_representative is not null then
    raise exception 'provide_either_existing_or_create' using errcode = 'P0001';
  end if;

  if p_representative_id is null and p_create_representative is null then
    raise exception 'representative_required' using errcode = 'P0001';
  end if;

  v_show_contacts := coalesce(
    case
      when p_create_representative is not null
           and p_create_representative ? 'show_contacts_to_members'
        then (p_create_representative->>'show_contacts_to_members')::boolean
      else null
    end,
    v_user.show_contacts_to_members,
    false
  );

  v_telegram := coalesce(
    nullif(
      ltrim(trim(coalesce(p_create_representative->>'telegram_username', '')), '@'),
      ''
    ),
    v_user.telegram_username
  );

  v_max := coalesce(
    nullif(
      ltrim(trim(coalesce(p_create_representative->>'max_username', '')), '@'),
      ''
    ),
    v_user.max_username
  );

  if p_representative_id is not null then
    if not exists (select 1 from public.representatives r where r.id = p_representative_id and r.is_active) then
      raise exception 'representative_not_found' using errcode = 'P0002';
    end if;

    select u.id into v_existing_link
    from public.users u
    where u.representative_id = p_representative_id
      and u.id <> p_user_id
    limit 1;

    if v_existing_link is not null then
      raise exception 'representative_already_linked' using errcode = 'P0001';
    end if;

    v_rep_id := p_representative_id;

    update public.representatives
    set
      show_contacts_to_members = v_user.show_contacts_to_members,
      telegram_username = coalesce(telegram_username, v_user.telegram_username),
      max_username = coalesce(max_username, v_user.max_username),
      position = coalesce(
        nullif(trim(position), ''),
        nullif(trim(v_user.position_hint), '')
      )
    where id = v_rep_id;
  else
    if p_create_representative ? 'company_id'
       and nullif(p_create_representative->>'company_id', '') is not null then
      v_company_id := (p_create_representative->>'company_id')::uuid;
      if not exists (select 1 from public.companies c where c.id = v_company_id) then
        raise exception 'company_not_found' using errcode = 'P0002';
      end if;
    else
      if nullif(p_create_representative->>'company_name', '') is null then
        raise exception 'company_required' using errcode = 'P0001';
      end if;

      v_company_inn := nullif(regexp_replace(
        coalesce(p_create_representative->>'company_inn', ''),
        '\D',
        '',
        'g'
      ), '');

      if v_company_inn is not null
         and v_company_inn !~ '^\d{10}(\d{2})?$' then
        raise exception 'invalid_company_inn' using errcode = 'P0001';
      end if;

      insert into public.companies (name, inn, access_status)
      values (
        trim(p_create_representative->>'company_name'),
        v_company_inn,
        'active'
      )
      returning id into v_company_id;
    end if;

    if nullif(p_create_representative->>'full_name', '') is null then
      raise exception 'representative_full_name_required' using errcode = 'P0001';
    end if;

    insert into public.representatives (
      company_id,
      full_name,
      position,
      phone,
      email,
      telegram_username,
      max_username,
      pd_consent,
      pd_consent_date,
      is_primary,
      is_active,
      show_contacts_to_members
    )
    values (
      v_company_id,
      trim(p_create_representative->>'full_name'),
      nullif(
        trim(coalesce(p_create_representative->>'position', v_user.position_hint, '')),
        ''
      ),
      nullif(trim(p_create_representative->>'phone'), ''),
      nullif(lower(trim(p_create_representative->>'email')), ''),
      v_telegram,
      v_max,
      coalesce((p_create_representative->>'pd_consent')::boolean, true),
      case
        when coalesce((p_create_representative->>'pd_consent')::boolean, true)
          then coalesce(v_user.pd_consent_at, now())
        else null
      end,
      coalesce((p_create_representative->>'is_primary')::boolean, true),
      true,
      v_show_contacts
    )
    returning id into v_rep_id;
  end if;

  update public.users
  set
    status = 'confirmed',
    representative_id = v_rep_id,
    full_name = coalesce(nullif(trim(full_name), ''), (
      select r.full_name from public.representatives r where r.id = v_rep_id
    ))
  where id = p_user_id
  returning * into v_user;

  return v_user;
end;
$$;

-- =============================================================================
-- END 20260715000071_registration_position_hint.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000072_company_access_statuses.sql
-- =============================================================================

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

-- =============================================================================
-- END 20260715000072_company_access_statuses.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000073_company_access_status_resource_access.sql
-- =============================================================================

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

-- =============================================================================
-- END 20260715000073_company_access_status_resource_access.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260715000074_level_resource_access_optional_statuses.sql
-- =============================================================================

-- Allow empty visibility/content status lists per level resource
-- (e.g. Partner level: all sections visible, no content for any status).

alter table public.participation_level_resource_access
  drop constraint if exists participation_level_resource_access_visibility_not_empty;

alter table public.participation_level_resource_access
  drop constraint if exists participation_level_resource_access_content_not_empty;

create or replace function public.validate_company_access_status_slug_array(p_slugs text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p_slugs is not null
    and (
      cardinality(p_slugs) = 0
      or not exists (
        select 1
        from unnest(p_slugs) as slug
        where not public.validate_company_access_status_slug(slug)
      )
    );
$$;

-- =============================================================================
-- END 20260715000074_level_resource_access_optional_statuses.sql
-- =============================================================================

-- =============================================================================
-- BEGIN 20260819000075_password_reset_tokens.sql
-- =============================================================================

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id, created_at desc);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

drop policy if exists password_reset_tokens_none on public.password_reset_tokens;
create policy password_reset_tokens_none
on public.password_reset_tokens
for all
to authenticated
using (false)
with check (false);

grant all on table public.password_reset_tokens to service_role;
revoke all on table public.password_reset_tokens from anon, authenticated;

-- =============================================================================
-- END 20260819000075_password_reset_tokens.sql
-- =============================================================================
