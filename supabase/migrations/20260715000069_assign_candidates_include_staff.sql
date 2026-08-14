-- Include APSS staff (role=admin) in company assign candidate list.

drop function if exists public.list_member_assign_candidates(uuid, text);

create or replace function public.list_member_assign_candidates(
  p_company_id uuid,
  p_search text default null
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status public.user_status,
  user_role public.user_role,
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
    u.role as user_role,
    r.id as representative_id,
    r.company_id as current_company_id,
    c.name as current_company_name
  from public.users u
  left join public.representatives r on r.id = u.representative_id
  left join public.companies c on c.id = r.company_id
  where u.status <> 'blocked'
    and (r.company_id is null or r.company_id <> p_company_id)
    and (
      v_term is null
      or u.email ilike '%' || v_term || '%'
      or coalesce(u.full_name, '') ilike '%' || v_term || '%'
      or coalesce(r.full_name, '') ilike '%' || v_term || '%'
    )
  order by u.role desc, coalesce(u.full_name, u.email)
  limit 80;
end;
$$;

revoke all on function public.list_member_assign_candidates(uuid, text) from public;
grant execute on function public.list_member_assign_candidates(uuid, text) to authenticated, service_role;
