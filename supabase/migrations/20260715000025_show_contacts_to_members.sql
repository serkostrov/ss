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
