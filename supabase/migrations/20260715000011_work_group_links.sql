-- Work group links: file metadata, reorder RPC, member storage read.

alter table public.work_group_links
  add column if not exists file_size bigint,
  add column if not exists mime_type text;

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
  if not public.is_admin() then
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

grant execute on function public.reorder_work_group_links(uuid, uuid[]) to authenticated;

-- Members of the group may download files via signed URLs (path = work_group_links.file_url).
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
      join public.work_group_members m on m.work_group_id = l.work_group_id
      join public.users u on u.representative_id = m.representative_id
      where l.file_url = name
        and u.id = auth.uid()
        and u.role = 'member'
        and u.status = 'confirmed'
    )
  )
);

-- Tighten bucket MIME allow-list (50 MiB already set).
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed'
  ]
where id = 'work-group-files';
