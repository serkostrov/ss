-- Unlink a user account from a representative (keep the representative contact row).

create or replace function public.unlink_representative_from_user(
  p_representative_id uuid
)
returns public.representatives
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep public.representatives;
  v_user public.users;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_representative_id is null then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_rep
  from public.representatives
  where id = p_representative_id;

  if not found then
    raise exception 'representative_not_found' using errcode = 'P0002';
  end if;

  select * into v_user
  from public.users
  where representative_id = p_representative_id
  for update;

  if not found then
    raise exception 'Представитель не привязан к учётной записи' using errcode = 'P0001';
  end if;

  update public.users
  set representative_id = null
  where id = v_user.id;

  return v_rep;
end;
$$;

revoke all on function public.unlink_representative_from_user(uuid) from public;
grant execute on function public.unlink_representative_from_user(uuid) to authenticated, service_role;
