-- Material release moderation + material category approval gate.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'material_moderation_status') then
    create type public.material_moderation_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- material_sections
-- ---------------------------------------------------------------------------

alter table public.material_sections
  add column if not exists moderation_status public.material_moderation_status
    not null default 'pending',
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- Keep already published materials visible in the cabinet.
update public.material_sections
set
  moderation_status = 'approved',
  reviewed_at = coalesce(reviewed_at, now())
where is_published is true
  and moderation_status is distinct from 'approved';

-- Unpublished drafts stay ready for submit (not in the queue).
update public.material_sections
set moderation_status = 'approved'
where is_published is false
  and moderation_status is distinct from 'approved'
  and reviewed_at is null
  and review_note is null;

create index if not exists material_sections_moderation_status_idx
  on public.material_sections (moderation_status, updated_at desc);

create or replace function public.protect_material_section_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_changed boolean;
  v_is_review_update boolean;
begin
  if tg_op = 'INSERT' then
    if new.is_published then
      -- Publish-on-create becomes a release request.
      new.moderation_status := 'pending';
      new.is_published := false;
    else
      new.moderation_status := 'approved';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  v_is_review_update :=
    public.is_admin()
    and new.moderation_status is distinct from old.moderation_status
    and new.reviewed_by is not null
    and new.reviewed_at is not null;

  if v_is_review_update then
    return new;
  end if;

  v_content_changed :=
    new.title is distinct from old.title
    or new.slug is distinct from old.slug
    or new.description is distinct from old.description
    or new.content is distinct from old.content
    or new.category_id is distinct from old.category_id;

  -- Content change on a live material → pull from cabinet and re-queue.
  if v_content_changed and old.is_published then
    new.moderation_status := 'pending';
    new.is_published := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Publish / re-publish attempt → release request instead of immediate publish.
  if new.is_published is true and old.is_published is false then
    new.moderation_status := 'pending';
    new.is_published := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Preserve review metadata for ordinary edits.
  new.moderation_status := old.moderation_status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  return new;
end;
$$;

drop trigger if exists material_sections_protect_moderation on public.material_sections;
create trigger material_sections_protect_moderation
before insert or update on public.material_sections
for each row execute function public.protect_material_section_moderation();

create or replace function public.review_material_section(
  p_section_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.material_sections
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_section public.material_sections;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_section
  from public.material_sections
  where id = p_section_id
  for update;

  if not found then
    raise exception 'material_not_found' using errcode = 'P0002';
  end if;

  update public.material_sections
  set
    moderation_status = case
      when p_approve then 'approved'::public.material_moderation_status
      else 'rejected'::public.material_moderation_status
    end,
    is_published = p_approve,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_section_id
  returning * into v_section;

  return v_section;
end;
$$;

revoke all on function public.review_material_section(uuid, boolean, text) from public;
grant execute on function public.review_material_section(uuid, boolean, text) to authenticated;

-- Members see only approved + published materials.
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
      and s.moderation_status = 'approved'
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
      and c.participation_level_id is not null
      and msl.participation_level_id = c.participation_level_id
  );
$$;

revoke all on function public.member_can_access_material_section(uuid) from public;
grant execute on function public.member_can_access_material_section(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- material_categories
-- ---------------------------------------------------------------------------

alter table public.material_categories
  add column if not exists moderation_status public.material_moderation_status
    not null default 'pending',
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

update public.material_categories
set
  moderation_status = 'approved',
  reviewed_at = coalesce(reviewed_at, now())
where moderation_status is distinct from 'approved';

create index if not exists material_categories_moderation_status_idx
  on public.material_categories (moderation_status, created_at desc);

create or replace function public.protect_material_category_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_review_update boolean;
begin
  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.is_active := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  v_is_review_update :=
    public.is_admin()
    and new.moderation_status is distinct from old.moderation_status
    and new.reviewed_by is not null
    and new.reviewed_at is not null;

  if v_is_review_update then
    return new;
  end if;

  -- Name change of an approved category → new approval request.
  if new.name is distinct from old.name and old.moderation_status = 'approved' then
    new.moderation_status := 'pending';
    new.is_active := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Preserve review metadata for ordinary edits.
  new.moderation_status := old.moderation_status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  -- Cannot activate until approved.
  if new.is_active is true and new.moderation_status is distinct from 'approved' then
    new.is_active := false;
  end if;

  return new;
end;
$$;

drop trigger if exists material_categories_protect_moderation on public.material_categories;
create trigger material_categories_protect_moderation
before insert or update on public.material_categories
for each row execute function public.protect_material_category_moderation();

create or replace function public.review_material_category(
  p_category_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.material_categories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_category public.material_categories;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_category
  from public.material_categories
  where id = p_category_id
  for update;

  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  update public.material_categories
  set
    moderation_status = case
      when p_approve then 'approved'::public.material_moderation_status
      else 'rejected'::public.material_moderation_status
    end,
    is_active = p_approve,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_category_id
  returning * into v_category;

  return v_category;
end;
$$;

revoke all on function public.review_material_category(uuid, boolean, text) from public;
grant execute on function public.review_material_category(uuid, boolean, text) to authenticated;

-- Members/admins: only approved active categories for non-admin reads.
drop policy if exists material_categories_select_authenticated on public.material_categories;
create policy material_categories_select_authenticated
on public.material_categories for select to authenticated
using (
  public.is_admin()
  or (
    is_active is true
    and moderation_status = 'approved'
  )
);
