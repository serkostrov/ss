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
