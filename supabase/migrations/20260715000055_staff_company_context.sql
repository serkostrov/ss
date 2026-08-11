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
