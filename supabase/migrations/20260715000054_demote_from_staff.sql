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
