-- Product category dictionary and member-proposed category moderation.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_category_suggestion_status') then
    create type public.product_category_suggestion_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_categories_name_not_blank check (btrim(name) <> ''),
  constraint product_categories_name_key unique (name),
  constraint product_categories_slug_key unique (slug)
);

alter table public.company_products
  add column if not exists category_id uuid
  references public.product_categories (id) on delete set null;

create table if not exists public.product_category_suggestions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.company_products (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  suggested_by uuid not null references public.users (id) on delete cascade,
  suggested_name text not null,
  status public.product_category_suggestion_status not null default 'pending',
  matched_category_id uuid references public.product_categories (id) on delete set null,
  review_note text,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint product_category_suggestions_name_not_blank check (btrim(suggested_name) <> '')
);

create index if not exists product_categories_order_idx
  on public.product_categories (sort_order, name);
create index if not exists company_products_category_idx
  on public.company_products (category_id);
create index if not exists product_category_suggestions_status_idx
  on public.product_category_suggestions (status, created_at desc);
create unique index if not exists product_category_suggestions_product_pending_idx
  on public.product_category_suggestions (product_id)
  where status = 'pending';

alter table public.product_categories enable row level security;
alter table public.product_category_suggestions enable row level security;

drop policy if exists product_categories_admin_all on public.product_categories;
create policy product_categories_admin_all
on public.product_categories for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_categories_select_authenticated on public.product_categories;
create policy product_categories_select_authenticated
on public.product_categories for select to authenticated
using (public.is_admin() or is_active is true);

drop policy if exists product_category_suggestions_admin_all
  on public.product_category_suggestions;
create policy product_category_suggestions_admin_all
on public.product_category_suggestions for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists product_category_suggestions_member_read
  on public.product_category_suggestions;
create policy product_category_suggestions_member_read
on public.product_category_suggestions for select to authenticated
using (
  suggested_by = auth.uid()
  and company_id = public.current_company_id()
);

create or replace function public.propose_product_category(
  p_product_id uuid,
  p_name text
)
returns public.product_category_suggestions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
  v_suggestion public.product_category_suggestions;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not public.is_confirmed_member() or v_name is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
    and company_id = public.current_company_id()
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.product_categories c
    where lower(btrim(c.name)) = lower(v_name)
  ) then
    raise exception 'category_already_exists' using errcode = '23505';
  end if;

  update public.product_category_suggestions
  set
    status = 'rejected',
    review_note = 'Заменено новой заявкой',
    reviewed_at = now()
  where product_id = p_product_id
    and status = 'pending';

  insert into public.product_category_suggestions (
    product_id,
    company_id,
    suggested_by,
    suggested_name
  )
  values (
    p_product_id,
    v_product.company_id,
    auth.uid(),
    v_name
  )
  returning * into v_suggestion;

  update public.company_products
  set category_id = null
  where id = p_product_id;

  return v_suggestion;
end;
$$;

create or replace function public.review_product_category_suggestion(
  p_suggestion_id uuid,
  p_approve boolean,
  p_category_id uuid default null,
  p_note text default null
)
returns public.product_category_suggestions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_suggestion public.product_category_suggestions;
  v_category_id uuid := p_category_id;
  v_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_suggestion
  from public.product_category_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'suggestion_not_found' using errcode = 'P0002';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'suggestion_already_reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_category_id is null then
      select id into v_category_id
      from public.product_categories
      where lower(btrim(name)) = lower(btrim(v_suggestion.suggested_name))
      limit 1;

      if v_category_id is null then
        select coalesce(max(sort_order), -1) + 1
        into v_sort_order
        from public.product_categories;

        insert into public.product_categories (name, slug, sort_order)
        values (
          btrim(v_suggestion.suggested_name),
          'suggested-' || substr(md5(lower(btrim(v_suggestion.suggested_name))), 1, 16),
          v_sort_order
        )
        returning id into v_category_id;
      end if;
    elsif not exists (
      select 1 from public.product_categories where id = v_category_id
    ) then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    update public.company_products
    set category_id = v_category_id
    where id = v_suggestion.product_id;
  end if;

  update public.product_category_suggestions
  set
    status = case
      when p_approve then 'approved'::public.product_category_suggestion_status
      else 'rejected'::public.product_category_suggestion_status
    end,
    matched_category_id = case when p_approve then v_category_id else null end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_suggestion_id
  returning * into v_suggestion;

  return v_suggestion;
end;
$$;

create or replace function public.get_product_category_usage(p_category_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'products', count(*),
    'total', count(*)
  )
  from public.company_products
  where category_id = p_category_id;
$$;

create or replace function public.delete_product_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.company_products where category_id = p_category_id
  ) then
    raise exception 'category_in_use' using errcode = 'P0001';
  end if;

  delete from public.product_categories where id = p_category_id;
end;
$$;

create or replace function public.reorder_product_categories(p_ordered_ids uuid[])
returns setof public.product_categories
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.product_categories c
  set sort_order = ordered.ordinality - 1
  from unnest(p_ordered_ids) with ordinality as ordered(id, ordinality)
  where c.id = ordered.id;

  return query
  select *
  from public.product_categories
  order by sort_order, name;
end;
$$;

revoke all on function public.propose_product_category(uuid, text) from public;
revoke all on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  from public;
revoke all on function public.get_product_category_usage(uuid) from public;
revoke all on function public.delete_product_category(uuid) from public;
revoke all on function public.reorder_product_categories(uuid[]) from public;

grant execute on function public.propose_product_category(uuid, text) to authenticated;
grant execute on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  to authenticated;
grant execute on function public.get_product_category_usage(uuid) to authenticated;
grant execute on function public.delete_product_category(uuid) to authenticated;
grant execute on function public.reorder_product_categories(uuid[]) to authenticated;

-- Include the approved category in the member directory product payload.
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
      ), '[]'::jsonb)
    ) as row_data
    from public.companies c
    left join public.participation_levels pl on pl.id = c.participation_level_id
    where c.access_status = 'active'
  ) directory;

  return v_result;
end;
$$;
