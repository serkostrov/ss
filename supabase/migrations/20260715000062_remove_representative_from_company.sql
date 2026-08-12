-- Remove representative from company (delete contact row).
-- Linked user account is kept; users.representative_id is cleared via FK on delete set null.

drop function if exists public.unlink_representative_from_user(uuid);

create or replace function public.remove_representative_from_company(
  p_representative_id uuid
)
returns table (
  company_id uuid,
  company_name text,
  full_name text,
  linked_user_id uuid
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep public.representatives;
  v_company public.companies;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_representative_id is null then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_rep
  from public.representatives
  where id = p_representative_id
  for update;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_company from public.companies where id = v_rep.company_id;

  select u.id into v_user_id
  from public.users u
  where u.representative_id = v_rep.id;

  company_id := v_rep.company_id;
  company_name := coalesce(v_company.name, '');
  full_name := v_rep.full_name;
  linked_user_id := v_user_id;

  delete from public.representatives where id = v_rep.id;

  return next;
end;
$$;

revoke all on function public.remove_representative_from_company(uuid) from public;
grant execute on function public.remove_representative_from_company(uuid) to authenticated, service_role;

-- Staff unbind should also remove the company contact, not leave an orphan row.
create or replace function public.unbind_staff_from_company(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
  v_rep_id uuid;
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

  v_rep_id := v_user.representative_id;

  update public.users
  set representative_id = null
  where id = p_user_id
  returning * into v_user;

  if v_rep_id is not null then
    delete from public.representatives
    where id = v_rep_id
      and not exists (
        select 1 from public.users u where u.representative_id = v_rep_id
      );
  end if;

  return v_user;
end;
$$;

revoke all on function public.unbind_staff_from_company(uuid) from public;
grant execute on function public.unbind_staff_from_company(uuid) to authenticated, service_role;
