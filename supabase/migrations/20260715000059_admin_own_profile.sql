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
