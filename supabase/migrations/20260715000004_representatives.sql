-- One primary representative per company + atomic set_primary RPC.

-- Resolve existing duplicates before unique index
with ranked as (
  select
    id,
    row_number() over (partition by company_id order by created_at asc, id asc) as rn
  from public.representatives
  where is_primary = true
)
update public.representatives r
set is_primary = false
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists representatives_one_primary_per_company_idx
  on public.representatives (company_id)
  where is_primary = true;

create or replace function public.set_primary_representative(p_representative_id uuid)
returns public.representatives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representatives;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_rep
  from public.representatives
  where id = p_representative_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  if not v_rep.is_active then
    raise exception 'inactive_representative_cannot_be_primary' using errcode = 'P0001';
  end if;

  update public.representatives
  set is_primary = false
  where company_id = v_rep.company_id
    and is_primary = true
    and id <> p_representative_id;

  update public.representatives
  set is_primary = true
  where id = p_representative_id
  returning * into v_rep;

  return v_rep;
end;
$$;

create or replace function public.upsert_representative(
  p_id uuid default null,
  p_company_id uuid default null,
  p_full_name text default null,
  p_position text default null,
  p_phone text default null,
  p_email text default null,
  p_pd_consent boolean default null,
  p_is_primary boolean default null,
  p_is_active boolean default null
)
returns public.representatives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representatives;
  v_company_id uuid;
  v_make_primary boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_id is null then
    if p_company_id is null or nullif(trim(p_full_name), '') is null then
      raise exception 'company_and_full_name_required' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;

    v_make_primary := coalesce(p_is_primary, false);

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
      trim(p_full_name),
      nullif(trim(p_position), ''),
      nullif(trim(p_phone), ''),
      nullif(lower(trim(p_email)), ''),
      coalesce(p_pd_consent, false),
      case when coalesce(p_pd_consent, false) then now() else null end,
      false,
      coalesce(p_is_active, true)
    )
    returning * into v_rep;

    if v_make_primary then
      return public.set_primary_representative(v_rep.id);
    end if;

    return v_rep;
  end if;

  select * into v_rep
  from public.representatives
  where id = p_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  v_company_id := coalesce(p_company_id, v_rep.company_id);

  if p_company_id is not null and p_company_id <> v_rep.company_id then
    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'company_not_found' using errcode = 'P0002';
    end if;
  end if;

  update public.representatives
  set
    company_id = v_company_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    position = case when p_position is null then position else nullif(trim(p_position), '') end,
    phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end,
    email = case when p_email is null then email else nullif(lower(trim(p_email)), '') end,
    pd_consent = coalesce(p_pd_consent, pd_consent),
    pd_consent_date = case
      when p_pd_consent is true and not pd_consent then now()
      when p_pd_consent is false then null
      else pd_consent_date
    end,
    is_active = coalesce(p_is_active, is_active),
    is_primary = case
      when coalesce(p_is_active, is_active) is false then false
      else is_primary
    end
  where id = p_id
  returning * into v_rep;

  if coalesce(p_is_primary, false) and v_rep.is_active then
    return public.set_primary_representative(v_rep.id);
  end if;

  if p_is_primary is false then
    update public.representatives
    set is_primary = false
    where id = p_id
    returning * into v_rep;
  end if;

  return v_rep;
end;
$$;

grant execute on function public.set_primary_representative(uuid) to authenticated;
grant execute on function public.upsert_representative(uuid, uuid, text, text, text, text, boolean, boolean, boolean) to authenticated;
