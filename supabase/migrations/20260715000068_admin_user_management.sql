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
