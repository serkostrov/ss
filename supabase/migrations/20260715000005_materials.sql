-- Materials: sections, level ACL, documents, reorder & ACL RPCs.

create table if not exists public.material_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  content text,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_section_levels (
  id uuid primary key default gen_random_uuid(),
  material_section_id uuid not null references public.material_sections (id) on delete cascade,
  participation_level_id uuid not null references public.participation_levels (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (material_section_id, participation_level_id)
);

create table if not exists public.material_documents (
  id uuid primary key default gen_random_uuid(),
  material_section_id uuid not null references public.material_sections (id) on delete cascade,
  title text not null,
  file_url text not null,
  file_size bigint,
  mime_type text,
  sort_order integer not null default 0,
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists material_sections_sort_idx
  on public.material_sections (sort_order, title);

create index if not exists material_sections_published_idx
  on public.material_sections (is_published);

create index if not exists material_section_levels_section_idx
  on public.material_section_levels (material_section_id);

create index if not exists material_section_levels_level_idx
  on public.material_section_levels (participation_level_id);

create index if not exists material_documents_section_idx
  on public.material_documents (material_section_id, sort_order);

drop trigger if exists material_sections_set_updated_at on public.material_sections;
create trigger material_sections_set_updated_at
before update on public.material_sections
for each row execute function public.set_updated_at();

alter table public.material_sections enable row level security;
alter table public.material_section_levels enable row level security;
alter table public.material_documents enable row level security;

drop policy if exists material_sections_admin_all on public.material_sections;
create policy material_sections_admin_all
on public.material_sections for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_sections_member_read on public.material_sections;
create policy material_sections_member_read
on public.material_sections for select to authenticated
using (
  public.is_admin()
  or (
    is_published = true
    and exists (
      select 1
      from public.users u
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      join public.material_section_levels msl
        on msl.material_section_id = material_sections.id
       and msl.participation_level_id = c.participation_level_id
      where u.id = auth.uid()
        and u.role = 'member'
        and u.status = 'confirmed'
        and c.access_status = 'active'
        and c.participation_level_id is not null
    )
  )
);

drop policy if exists material_section_levels_admin_all on public.material_section_levels;
create policy material_section_levels_admin_all
on public.material_section_levels for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_section_levels_member_read on public.material_section_levels;
create policy material_section_levels_member_read
on public.material_section_levels for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.material_sections s
    where s.id = material_section_levels.material_section_id
      and s.is_published = true
  )
);

drop policy if exists material_documents_admin_all on public.material_documents;
create policy material_documents_admin_all
on public.material_documents for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists material_documents_member_read on public.material_documents;
create policy material_documents_member_read
on public.material_documents for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.material_sections s
    where s.id = material_documents.material_section_id
      and s.is_published = true
  )
);

create or replace function public.reorder_material_sections(p_ordered_ids uuid[])
returns setof public.material_sections
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
    update public.material_sections
    set sort_order = v_index
    where id = v_id;

    if not found then
      raise exception 'section_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.material_sections
    order by sort_order asc, title asc;
end;
$$;

create or replace function public.set_material_section_levels(
  p_section_id uuid,
  p_level_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.material_sections where id = p_section_id) then
    raise exception 'section_not_found' using errcode = 'P0002';
  end if;

  delete from public.material_section_levels
  where material_section_id = p_section_id;

  if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
    insert into public.material_section_levels (material_section_id, participation_level_id)
    select p_section_id, unnest(p_level_ids);
  end if;
end;
$$;

grant execute on function public.reorder_material_sections(uuid[]) to authenticated;
grant execute on function public.set_material_section_levels(uuid, uuid[]) to authenticated;
