-- Responsible representative (not necessarily APSS staff) may manage group links and files.

-- -----------------------------------------------------------------------------
-- Helper: current user is the group's responsible representative
-- -----------------------------------------------------------------------------

create or replace function public.is_work_group_responsible(p_work_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.work_groups wg
    join public.users u on u.representative_id = wg.responsible_representative_id
    where wg.id = p_work_group_id
      and wg.responsible_representative_id is not null
      and u.id = auth.uid()
      and public.is_confirmed_member()
  );
$$;

revoke all on function public.is_work_group_responsible(uuid) from public;
grant execute on function public.is_work_group_responsible(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- work_group_links: responsible may read (even if not a member) and write
-- -----------------------------------------------------------------------------

drop policy if exists work_group_links_member_read on public.work_group_links;
create policy work_group_links_member_read
on public.work_group_links for select to authenticated
using (
  public.is_admin()
  or public.member_belongs_to_work_group(work_group_id)
  or public.is_work_group_responsible(work_group_id)
);

drop policy if exists work_group_links_responsible_insert on public.work_group_links;
create policy work_group_links_responsible_insert
on public.work_group_links for insert to authenticated
with check (public.is_work_group_responsible(work_group_id));

drop policy if exists work_group_links_responsible_update on public.work_group_links;
create policy work_group_links_responsible_update
on public.work_group_links for update to authenticated
using (public.is_work_group_responsible(work_group_id))
with check (public.is_work_group_responsible(work_group_id));

drop policy if exists work_group_links_responsible_delete on public.work_group_links;
create policy work_group_links_responsible_delete
on public.work_group_links for delete to authenticated
using (public.is_work_group_responsible(work_group_id));

-- -----------------------------------------------------------------------------
-- Storage work-group-files: responsible upload / delete / read
-- -----------------------------------------------------------------------------

drop policy if exists work_group_files_member_read on storage.objects;
create policy work_group_files_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'work-group-files'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.work_group_links l
      where l.file_url = name
        and (
          public.member_belongs_to_work_group(l.work_group_id)
          or public.is_work_group_responsible(l.work_group_id)
        )
    )
  )
);

drop policy if exists work_group_files_responsible_insert on storage.objects;
create policy work_group_files_responsible_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_groups wg
    where wg.responsible_representative_id = public.current_representative_id()
      and public.is_confirmed_member()
      and name like wg.id::text || '/%'
  )
);

drop policy if exists work_group_files_responsible_update on storage.objects;
create policy work_group_files_responsible_update
on storage.objects for update to authenticated
using (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_group_links l
    where l.file_url = name
      and public.is_work_group_responsible(l.work_group_id)
  )
)
with check (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_group_links l
    where l.file_url = name
      and public.is_work_group_responsible(l.work_group_id)
  )
);

drop policy if exists work_group_files_responsible_delete on storage.objects;
create policy work_group_files_responsible_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-group-files'
  and exists (
    select 1
    from public.work_group_links l
    where l.file_url = name
      and public.is_work_group_responsible(l.work_group_id)
  )
);

-- -----------------------------------------------------------------------------
-- Reorder RPC: admins and responsible representatives
-- -----------------------------------------------------------------------------

create or replace function public.reorder_work_group_links(
  p_work_group_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.work_group_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_index integer := 0;
begin
  if not (
    public.is_admin()
    or public.is_work_group_responsible(p_work_group_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.work_groups where id = p_work_group_id) then
    raise exception 'work_group_not_found' using errcode = 'P0002';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.work_group_links
    set sort_order = v_index
    where id = v_id
      and work_group_id = p_work_group_id;

    if not found then
      raise exception 'link_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  update public.work_groups
  set updated_at = now()
  where id = p_work_group_id;

  return query
    select *
    from public.work_group_links
    where work_group_id = p_work_group_id
    order by sort_order asc, title asc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cabinet list: expose is_responsible
-- -----------------------------------------------------------------------------

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
  where wg.status is distinct from 'archived'
  order by
    (wgm.id is not null) desc,
    (wg.responsible_representative_id is not null and wg.responsible_representative_id = v_rep_id) desc,
    cat.name nulls last,
    wg.name;
end;
$$;

revoke all on function public.list_cabinet_work_groups() from public;
grant execute on function public.list_cabinet_work_groups() to authenticated, service_role;
