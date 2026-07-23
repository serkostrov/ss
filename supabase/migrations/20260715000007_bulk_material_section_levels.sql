-- Bulk ACL for material sections + helper to read max sort_order cheaply.

create or replace function public.bulk_set_material_section_levels(
  p_section_ids uuid[],
  p_level_ids uuid[],
  p_mode text default 'replace'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
  v_mode text := lower(coalesce(p_mode, 'replace'));
  v_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_section_ids is null or array_length(p_section_ids, 1) is null then
    raise exception 'section_ids_required' using errcode = 'P0001';
  end if;

  if v_mode not in ('replace', 'add', 'remove') then
    raise exception 'invalid_mode' using errcode = 'P0001';
  end if;

  foreach v_section_id in array p_section_ids loop
    if not exists (select 1 from public.material_sections where id = v_section_id) then
      raise exception 'section_not_found' using errcode = 'P0002';
    end if;

    if v_mode = 'replace' then
      delete from public.material_section_levels
      where material_section_id = v_section_id;

      if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
        insert into public.material_section_levels (material_section_id, participation_level_id)
        select distinct v_section_id, level_id
        from unnest(p_level_ids) as level_id
        on conflict do nothing;
      end if;
    elsif v_mode = 'add' then
      if p_level_ids is null or array_length(p_level_ids, 1) is null then
        raise exception 'level_ids_required' using errcode = 'P0001';
      end if;

      insert into public.material_section_levels (material_section_id, participation_level_id)
      select distinct v_section_id, level_id
      from unnest(p_level_ids) as level_id
      on conflict do nothing;
    else
      -- remove
      if p_level_ids is null or array_length(p_level_ids, 1) is null then
        raise exception 'level_ids_required' using errcode = 'P0001';
      end if;

      delete from public.material_section_levels
      where material_section_id = v_section_id
        and participation_level_id = any (p_level_ids);
    end if;

    update public.material_sections
    set updated_at = now()
    where id = v_section_id;

    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

grant execute on function public.bulk_set_material_section_levels(uuid[], uuid[], text) to authenticated;
