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
