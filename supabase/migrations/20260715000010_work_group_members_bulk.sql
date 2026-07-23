-- Bulk add work group members (duplicate-safe) + helper indexes.

create or replace function public.bulk_add_work_group_members(
  p_work_group_id uuid,
  p_representative_ids uuid[],
  p_added_by uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.work_groups where id = p_work_group_id) then
    raise exception 'work_group_not_found' using errcode = 'P0002';
  end if;

  if p_representative_ids is null or array_length(p_representative_ids, 1) is null then
    raise exception 'representative_ids_required' using errcode = 'P0001';
  end if;

  with candidates as (
    select distinct unnest(p_representative_ids) as representative_id
  ),
  valid as (
    select c.representative_id
    from candidates c
    join public.representatives r on r.id = c.representative_id
  ),
  inserted as (
    insert into public.work_group_members (work_group_id, representative_id, added_by)
    select p_work_group_id, v.representative_id, p_added_by
    from valid v
    on conflict (work_group_id, representative_id) do nothing
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  update public.work_groups
  set updated_at = now()
  where id = p_work_group_id;

  return v_inserted;
end;
$$;

grant execute on function public.bulk_add_work_group_members(uuid, uuid[], uuid) to authenticated;

create index if not exists work_group_members_rep_group_idx
  on public.work_group_members (representative_id, work_group_id);
