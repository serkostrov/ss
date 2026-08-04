-- Product moderation status + grants for product category tables.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_moderation_status') then
    create type public.product_moderation_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

alter table public.company_products
  add column if not exists moderation_status public.product_moderation_status
    not null default 'pending',
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- Keep already published products visible in the directory.
update public.company_products
set moderation_status = 'approved'
where moderation_status is distinct from 'approved';

create index if not exists company_products_moderation_status_idx
  on public.company_products (moderation_status, created_at desc);

-- Members must not self-approve products.
create or replace function public.protect_company_product_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.review_note := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if
    new.name is distinct from old.name
    or new.url is distinct from old.url
    or new.category_id is distinct from old.category_id
    or new.is_active is distinct from old.is_active
  then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  else
    new.moderation_status := old.moderation_status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

drop trigger if exists company_products_protect_moderation on public.company_products;
create trigger company_products_protect_moderation
before insert or update on public.company_products
for each row execute function public.protect_company_product_moderation();

create or replace function public.review_company_product(
  p_product_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  update public.company_products
  set
    moderation_status = case when p_approve then 'approved'::public.product_moderation_status
      else 'rejected'::public.product_moderation_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_product_id
  returning * into v_product;

  return v_product;
end;
$$;

revoke all on function public.review_company_product(uuid, boolean, text) from public;
grant execute on function public.review_company_product(uuid, boolean, text) to authenticated;

-- Missing grants from 000039 (parity with other dictionaries).
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.product_category_suggestions to authenticated;

-- Directory: only approved products.
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
            'category_name', pc.name
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
        left join public.product_categories pc on pc.id = p.category_id
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
