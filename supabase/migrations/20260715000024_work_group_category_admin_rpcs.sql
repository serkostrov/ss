-- Admin RPCs for work group categories (directions): usage, safe delete, reorder.

create or replace function public.get_work_group_category_usage(p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_groups integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_work_groups
  from public.work_groups
  where category_id = p_category_id;

  return jsonb_build_object(
    'work_groups', v_work_groups,
    'total', v_work_groups
  );
end;
$$;

create or replace function public.delete_work_group_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage jsonb;
  v_total integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.work_group_categories where id = p_category_id) then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  v_usage := public.get_work_group_category_usage(p_category_id);
  v_total := coalesce((v_usage->>'total')::integer, 0);

  if v_total > 0 then
    raise exception 'category_in_use:%', v_usage::text using errcode = 'P0001';
  end if;

  delete from public.work_group_categories where id = p_category_id;
end;
$$;

create or replace function public.reorder_work_group_categories(p_ordered_ids uuid[])
returns setof public.work_group_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.work_group_categories
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.work_group_categories
    order by sort_order asc, name asc;
end;
$$;

revoke all on function public.get_work_group_category_usage(uuid) from public;
revoke all on function public.delete_work_group_category(uuid) from public;
revoke all on function public.reorder_work_group_categories(uuid[]) from public;

grant execute on function public.get_work_group_category_usage(uuid) to authenticated, service_role;
grant execute on function public.delete_work_group_category(uuid) to authenticated, service_role;
grant execute on function public.reorder_work_group_categories(uuid[]) to authenticated, service_role;
