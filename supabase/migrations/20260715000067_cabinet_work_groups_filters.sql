-- Cabinet work groups list: include archived so status filter matches admin panel.

drop function if exists public.list_cabinet_work_groups();

create or replace function public.list_cabinet_work_groups()
returns table (
  id uuid,
  name text,
  description text,
  status public.work_group_status,
  category_id uuid,
  category_name text,
  is_member boolean,
  is_responsible boolean,
  joined_at timestamptz,
  pending_request_id uuid,
  pending_request_kind public.work_group_membership_request_kind,
  pending_request_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rep_id uuid;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_rep_id := public.current_representative_id();

  return query
  select
    wg.id,
    wg.name,
    wg.description,
    wg.status,
    wg.category_id,
    cat.name as category_name,
    (wgm.id is not null) as is_member,
    (
      wg.responsible_representative_id is not null
      and wg.responsible_representative_id = v_rep_id
    ) as is_responsible,
    wgm.created_at as joined_at,
    req.id as pending_request_id,
    req.kind as pending_request_kind,
    req.created_at as pending_request_at
  from public.work_groups wg
  left join public.work_group_categories cat on cat.id = wg.category_id
  left join public.work_group_members wgm
    on wgm.work_group_id = wg.id
   and wgm.representative_id = v_rep_id
  left join public.work_group_membership_requests req
    on req.work_group_id = wg.id
   and req.representative_id = v_rep_id
   and req.status = 'pending'::public.work_group_membership_request_status
  order by
    (wgm.id is not null) desc,
    (wg.responsible_representative_id is not null and wg.responsible_representative_id = v_rep_id) desc,
    cat.name nulls last,
    wg.name;
end;
$$;

revoke all on function public.list_cabinet_work_groups() from public;
grant execute on function public.list_cabinet_work_groups() to authenticated, service_role;
