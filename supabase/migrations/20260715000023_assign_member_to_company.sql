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
