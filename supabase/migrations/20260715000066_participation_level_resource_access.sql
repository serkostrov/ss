-- Per-participation-level cabinet resource access: separate visibility vs content by company status.

-- -----------------------------------------------------------------------------
-- Types + table
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cabinet_resource') then
    create type public.cabinet_resource as enum (
      'directory',
      'products',
      'materials',
      'polls',
      'work_groups',
      'invoices'
    );
  end if;
end
$$;

create table if not exists public.participation_level_resource_access (
  participation_level_id uuid not null
    references public.participation_levels (id) on delete cascade,
  resource public.cabinet_resource not null,
  visibility_statuses public.company_access_status[] not null,
  content_statuses public.company_access_status[] not null,
  primary key (participation_level_id, resource),
  constraint participation_level_resource_access_visibility_not_empty
    check (cardinality(visibility_statuses) >= 1),
  constraint participation_level_resource_access_content_not_empty
    check (cardinality(content_statuses) >= 1)
);

alter table public.participation_level_resource_access enable row level security;

drop policy if exists participation_level_resource_access_admin_all
  on public.participation_level_resource_access;
create policy participation_level_resource_access_admin_all
on public.participation_level_resource_access for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Seed defaults for existing levels: visible for active+suspended, content for active only.
insert into public.participation_level_resource_access (
  participation_level_id,
  resource,
  visibility_statuses,
  content_statuses
)
select
  pl.id,
  r.resource,
  array['active', 'suspended']::public.company_access_status[],
  array['active']::public.company_access_status[]
from public.participation_levels pl
cross join (
  values
    ('directory'::public.cabinet_resource),
    ('products'::public.cabinet_resource),
    ('materials'::public.cabinet_resource),
    ('polls'::public.cabinet_resource),
    ('work_groups'::public.cabinet_resource),
    ('invoices'::public.cabinet_resource)
) as r(resource)
on conflict (participation_level_id, resource) do nothing;

create or replace function public.trg_seed_level_resource_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.participation_level_resource_access (
    participation_level_id,
    resource,
    visibility_statuses,
    content_statuses
  )
  select
    new.id,
    r.resource,
    array['active', 'suspended']::public.company_access_status[],
    array['active']::public.company_access_status[]
  from (
    values
      ('directory'::public.cabinet_resource),
      ('products'::public.cabinet_resource),
      ('materials'::public.cabinet_resource),
      ('polls'::public.cabinet_resource),
      ('work_groups'::public.cabinet_resource),
      ('invoices'::public.cabinet_resource)
  ) as r(resource)
  on conflict (participation_level_id, resource) do nothing;

  return new;
end;
$$;

drop trigger if exists participation_levels_seed_resource_access on public.participation_levels;
create trigger participation_levels_seed_resource_access
after insert on public.participation_levels
for each row
execute function public.trg_seed_level_resource_access();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.current_company_access_status()
returns public.company_access_status
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.access_status
  from public.users u
  join public.representatives r on r.id = u.representative_id
  join public.companies c on c.id = r.company_id
  where u.id = auth.uid()
    and u.representative_id is not null
    and (
      (u.role = 'member' and u.status = 'confirmed')
      or (u.role = 'admin' and u.status is distinct from 'blocked')
    )
  limit 1;
$$;

create or replace function public.member_cabinet_resource_allowed(
  p_resource public.cabinet_resource,
  p_kind text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.is_confirmed_member()
    and coalesce(
      (
        select case
          when p_kind = 'visibility' then
            public.current_company_access_status() = any(plra.visibility_statuses)
          when p_kind = 'content' then
            public.current_company_access_status() = any(plra.content_statuses)
          else false
        end
        from public.users u
        join public.representatives r on r.id = u.representative_id
        join public.companies c on c.id = r.company_id
        join public.participation_level_resource_access plra
          on plra.participation_level_id = c.participation_level_id
         and plra.resource = p_resource
        where u.id = auth.uid()
          and u.representative_id is not null
          and (
            (u.role = 'member' and u.status = 'confirmed')
            or (u.role = 'admin' and u.status is distinct from 'blocked')
          )
      ),
      case
        when p_kind = 'visibility' then
          public.current_company_access_status() in ('active', 'suspended')
        when p_kind = 'content' then
          public.current_company_access_status() = 'active'
        else false
      end
    );
$$;

-- Level id for ACL joins regardless of company status (resource rules gate access).
create or replace function public.current_company_level_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.participation_level_id
  from public.users u
  join public.representatives r on r.id = u.representative_id
  join public.companies c on c.id = r.company_id
  where u.id = auth.uid()
    and u.representative_id is not null
    and (
      (u.role = 'member' and u.status = 'confirmed')
      or (u.role = 'admin' and u.status is distinct from 'blocked')
    )
  limit 1;
$$;

create or replace function public.member_can_access_material_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
      and public.member_cabinet_resource_allowed('materials'::public.cabinet_resource, 'content')
      and c.participation_level_id is not null
      and msl.participation_level_id = c.participation_level_id
  );
$$;

create or replace function public.member_can_access_poll(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.polls p
    join public.poll_level_access pla on pla.poll_id = p.id
    join public.users u on u.id = auth.uid()
    join public.representatives r on r.id = u.representative_id
    join public.companies c on c.id = r.company_id
    where p.id = p_poll_id
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and u.representative_id is not null
      and (
        (u.role = 'member' and u.status = 'confirmed')
        or (u.role = 'admin' and u.status is distinct from 'blocked')
      )
      and public.member_cabinet_resource_allowed('polls'::public.cabinet_resource, 'content')
      and c.participation_level_id is not null
      and pla.participation_level_id = c.participation_level_id
  );
$$;

revoke all on function public.current_company_access_status() from public;
grant execute on function public.current_company_access_status() to authenticated, service_role;

revoke all on function public.member_cabinet_resource_allowed(public.cabinet_resource, text) from public;
grant execute on function public.member_cabinet_resource_allowed(public.cabinet_resource, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Cabinet + admin RPCs
-- -----------------------------------------------------------------------------

create or replace function public.get_cabinet_resource_access()
returns table (
  resource public.cabinet_resource,
  visible boolean,
  has_content boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.cabinet_resource;
begin
  if not public.is_confirmed_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  foreach r in array array[
    'directory'::public.cabinet_resource,
    'products'::public.cabinet_resource,
    'materials'::public.cabinet_resource,
    'polls'::public.cabinet_resource,
    'work_groups'::public.cabinet_resource,
    'invoices'::public.cabinet_resource
  ]
  loop
    resource := r;
    visible := public.member_cabinet_resource_allowed(r, 'visibility');
    has_content := public.member_cabinet_resource_allowed(r, 'content');
    return next;
  end loop;
end;
$$;

create or replace function public.get_participation_level_resource_access(p_level_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.participation_levels where id = p_level_id) then
    raise exception 'level_not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'resource', plra.resource,
      'visibility_statuses', to_jsonb(plra.visibility_statuses),
      'content_statuses', to_jsonb(plra.content_statuses)
    )
    order by plra.resource::text
  ), '[]'::jsonb)
  into v_result
  from public.participation_level_resource_access plra
  where plra.participation_level_id = p_level_id;

  return v_result;
end;
$$;

create or replace function public.set_participation_level_resource_access(
  p_level_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row jsonb;
  v_resource public.cabinet_resource;
  v_visibility public.company_access_status[];
  v_content public.company_access_status[];
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.participation_levels where id = p_level_id) then
    raise exception 'level_not_found' using errcode = 'P0002';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_resource := (v_row->>'resource')::public.cabinet_resource;
    v_visibility := array(
      select jsonb_array_elements_text(v_row->'visibility_statuses')::public.company_access_status
    );
    v_content := array(
      select jsonb_array_elements_text(v_row->'content_statuses')::public.company_access_status
    );

    if cardinality(v_visibility) < 1 or cardinality(v_content) < 1 then
      raise exception 'statuses_required' using errcode = 'P0001';
    end if;

    insert into public.participation_level_resource_access (
      participation_level_id,
      resource,
      visibility_statuses,
      content_statuses
    )
    values (p_level_id, v_resource, v_visibility, v_content)
    on conflict (participation_level_id, resource) do update
    set
      visibility_statuses = excluded.visibility_statuses,
      content_statuses = excluded.content_statuses;
  end loop;

  return public.get_participation_level_resource_access(p_level_id);
end;
$$;

revoke all on function public.get_cabinet_resource_access() from public;
grant execute on function public.get_cabinet_resource_access() to authenticated, service_role;

revoke all on function public.get_participation_level_resource_access(uuid) from public;
grant execute on function public.get_participation_level_resource_access(uuid) to authenticated, service_role;

revoke all on function public.set_participation_level_resource_access(uuid, jsonb) from public;
grant execute on function public.set_participation_level_resource_access(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS: products + invoices
-- -----------------------------------------------------------------------------

drop policy if exists company_products_select_own_member on public.company_products;
create policy company_products_select_own_member
on public.company_products for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists company_products_insert_own_member on public.company_products;
create policy company_products_insert_own_member
on public.company_products for insert to authenticated
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists company_products_update_own_member on public.company_products;
create policy company_products_update_own_member
on public.company_products for update to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
)
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists company_products_delete_own_member on public.company_products;
create policy company_products_delete_own_member
on public.company_products for delete to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('products'::public.cabinet_resource, 'content')
);

drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read
on public.invoices for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and public.member_cabinet_resource_allowed('invoices'::public.cabinet_resource, 'content')
  and status in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  )
);

-- Directory: empty payload when content access is denied.
create or replace function public.list_association_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_result jsonb;
  v_is_admin boolean := public.is_admin();
  v_viewer_rep_id uuid := public.current_representative_id();
begin
  if not (v_is_admin or public.is_confirmed_member()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not v_is_admin
     and not public.member_cabinet_resource_allowed('directory'::public.cabinet_resource, 'content') then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'inn', c.inn,
      'description', c.description,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'address', c.address,
      'participation_level_name', pl.name,
      'representatives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'position', r.position,
            'phone', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.phone
              else null
            end,
            'email', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.email
              else null
            end,
            'telegram_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.telegram_username
              else null
            end,
            'max_username', case
              when v_is_admin or r.show_contacts_to_members or r.id = v_viewer_rep_id
                then r.max_username
              else null
            end,
            'is_primary', r.is_primary,
            'show_contacts_to_members', r.show_contacts_to_members
          )
          order by r.is_primary desc, r.full_name
        )
        from public.representatives r
        where r.company_id = c.id
          and r.is_active is true
      ), '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'url', p.url,
            'sort_order', p.sort_order,
            'category_id', p.category_id,
            'category_name', pc.name,
            'okpd_code_id', p.okpd_code_id,
            'okpd_code', oc.code,
            'okpd_title', oc.title,
            'note_id', p.note_id,
            'note_name', pn.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
        left join public.okpd2_codes oc on oc.id = p.okpd_code_id
        left join public.product_notes pn on pn.id = p.note_id
        where p.company_id = c.id
          and p.is_active is true
          and p.moderation_status = 'approved'
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;

-- Work group links read: require work_groups content access for members (admins/responsible unchanged).
drop policy if exists work_group_links_member_read on public.work_group_links;
create policy work_group_links_member_read
on public.work_group_links for select to authenticated
using (
  public.is_admin()
  or public.is_work_group_responsible(work_group_id)
  or (
    public.member_belongs_to_work_group(work_group_id)
    and public.member_cabinet_resource_allowed('work_groups'::public.cabinet_resource, 'content')
  )
);

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
          public.is_work_group_responsible(l.work_group_id)
          or (
            public.member_belongs_to_work_group(l.work_group_id)
            and public.member_cabinet_resource_allowed('work_groups'::public.cabinet_resource, 'content')
          )
        )
    )
  )
);
