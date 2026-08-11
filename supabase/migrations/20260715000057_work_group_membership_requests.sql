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
