-- Storage bucket for material documents + reorder RPC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-documents',
  'material-documents',
  false,
  26214400, -- 25 MiB
  array[
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
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists material_documents_storage_admin_all on storage.objects;
create policy material_documents_storage_admin_all
on storage.objects for all to authenticated
using (
  bucket_id = 'material-documents'
  and public.is_admin()
)
with check (
  bucket_id = 'material-documents'
  and public.is_admin()
);

drop policy if exists material_documents_storage_member_read on storage.objects;
create policy material_documents_storage_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'material-documents'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.material_documents d
      join public.material_sections s on s.id = d.material_section_id
      join public.users u on u.id = auth.uid()
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      join public.material_section_levels msl
        on msl.material_section_id = s.id
       and msl.participation_level_id = c.participation_level_id
      where d.file_url = name
        and s.is_published = true
        and u.role = 'member'
        and u.status = 'confirmed'
        and c.access_status = 'active'
    )
  )
);

create or replace function public.reorder_material_documents(
  p_section_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.material_documents
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

  if not exists (select 1 from public.material_sections where id = p_section_id) then
    raise exception 'section_not_found' using errcode = 'P0002';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.material_documents
    set sort_order = v_index
    where id = v_id
      and material_section_id = p_section_id;

    if not found then
      raise exception 'document_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.material_documents
    where material_section_id = p_section_id
    order by sort_order asc, title asc;
end;
$$;

grant execute on function public.reorder_material_documents(uuid, uuid[]) to authenticated;
