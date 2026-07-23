-- Harden material ACL for members: shared visibility helper + strict policies.
-- Closed / unpublished materials must be unreachable via table SELECT (not only UI).

create or replace function public.member_can_access_material_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.material_sections s
    join public.material_section_levels msl on msl.material_section_id = s.id
    join public.users u on u.id = auth.uid()
    join public.representatives r on r.id = u.representative_id
    join public.companies c on c.id = r.company_id
    where s.id = p_section_id
      and s.is_published = true
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
      and c.participation_level_id is not null
      and msl.participation_level_id = c.participation_level_id
  );
$$;

revoke all on function public.member_can_access_material_section(uuid) from public;
grant execute on function public.member_can_access_material_section(uuid) to authenticated;

drop policy if exists material_sections_member_read on public.material_sections;
create policy material_sections_member_read
on public.material_sections for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_material_section(id)
);

drop policy if exists material_section_levels_member_read on public.material_section_levels;
create policy material_section_levels_member_read
on public.material_section_levels for select to authenticated
using (
  public.is_admin()
  or (
    public.member_can_access_material_section(material_section_id)
    and exists (
      select 1
      from public.users u
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      where u.id = auth.uid()
        and c.participation_level_id = material_section_levels.participation_level_id
    )
  )
);

drop policy if exists material_documents_member_read on public.material_documents;
create policy material_documents_member_read
on public.material_documents for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_material_section(material_section_id)
);

-- Align storage object read with the same helper (path = material_documents.file_url).
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
      where d.file_url = name
        and public.member_can_access_material_section(d.material_section_id)
    )
  )
);
