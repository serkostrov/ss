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
