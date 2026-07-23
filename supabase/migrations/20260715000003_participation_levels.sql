-- Participation levels: protect delete when in use; atomic delete & reorder RPCs.

-- Companies must not silently lose level on delete
alter table public.companies
  drop constraint if exists companies_participation_level_id_fkey;

alter table public.companies
  add constraint companies_participation_level_id_fkey
  foreign key (participation_level_id)
  references public.participation_levels (id)
  on delete restrict;

create or replace function public.get_participation_level_usage(p_level_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companies integer := 0;
  v_material_sections integer := 0;
  v_polls integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_companies
  from public.companies
  where participation_level_id = p_level_id;

  if to_regclass('public.material_section_levels') is not null then
    execute
      'select count(*)::integer from public.material_section_levels where participation_level_id = $1'
      into v_material_sections
      using p_level_id;
  end if;

  if to_regclass('public.poll_level_access') is not null then
    execute
      'select count(*)::integer from public.poll_level_access where participation_level_id = $1'
      into v_polls
      using p_level_id;
  end if;

  return jsonb_build_object(
    'companies', v_companies,
    'material_sections', v_material_sections,
    'polls', v_polls,
    'total', v_companies + v_material_sections + v_polls
  );
end;
$$;

create or replace function public.delete_participation_level(p_level_id uuid)
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

  if not exists (select 1 from public.participation_levels where id = p_level_id) then
    raise exception 'level_not_found' using errcode = 'P0002';
  end if;

  v_usage := public.get_participation_level_usage(p_level_id);
  v_total := coalesce((v_usage->>'total')::integer, 0);

  if v_total > 0 then
    raise exception 'level_in_use:%', v_usage::text using errcode = 'P0001';
  end if;

  delete from public.participation_levels where id = p_level_id;
end;
$$;

create or replace function public.reorder_participation_levels(p_ordered_ids uuid[])
returns setof public.participation_levels
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
    update public.participation_levels
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'level_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.participation_levels
    order by sort_order asc, name asc;
end;
$$;

grant execute on function public.get_participation_level_usage(uuid) to authenticated;
grant execute on function public.delete_participation_level(uuid) to authenticated;
grant execute on function public.reorder_participation_levels(uuid[]) to authenticated;
