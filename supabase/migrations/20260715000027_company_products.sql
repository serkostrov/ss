-- Company products (name + URL, sortable) + directory exposure.

create table if not exists public.company_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_products_name_not_blank check (btrim(name) <> '')
);

create index if not exists company_products_company_sort_idx
  on public.company_products (company_id, sort_order, name);

drop trigger if exists company_products_set_updated_at on public.company_products;
create trigger company_products_set_updated_at
before update on public.company_products
for each row execute function public.set_updated_at();

alter table public.company_products enable row level security;

drop policy if exists company_products_admin_all on public.company_products;
create policy company_products_admin_all
on public.company_products for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_products_select_own_member on public.company_products;
create policy company_products_select_own_member
on public.company_products for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

drop policy if exists company_products_insert_own_member on public.company_products;
create policy company_products_insert_own_member
on public.company_products for insert to authenticated
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

drop policy if exists company_products_update_own_member on public.company_products;
create policy company_products_update_own_member
on public.company_products for update to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
)
with check (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

drop policy if exists company_products_delete_own_member on public.company_products;
create policy company_products_delete_own_member
on public.company_products for delete to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
);

grant select, insert, update, delete on public.company_products to authenticated;

-- Reorder (admin or own company)

create or replace function public.reorder_company_products(
  p_company_id uuid,
  p_ordered_ids uuid[]
)
returns setof public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_index integer := 0;
begin
  if not (
    public.is_admin()
    or (
      public.is_confirmed_member()
      and public.current_company_id() = p_company_id
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'company_required' using errcode = 'P0001';
  end if;

  if p_ordered_ids is null or array_length(p_ordered_ids, 1) is null then
    raise exception 'ordered_ids_required' using errcode = 'P0001';
  end if;

  foreach v_id in array p_ordered_ids loop
    update public.company_products
    set sort_order = v_index
    where id = v_id
      and company_id = p_company_id;

    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;

    v_index := v_index + 1;
  end loop;

  return query
    select *
    from public.company_products
    where company_id = p_company_id
    order by sort_order asc, name asc;
end;
$$;

revoke all on function public.reorder_company_products(uuid, uuid[]) from public;
grant execute on function public.reorder_company_products(uuid, uuid[]) to authenticated, service_role;

-- Directory: include active products

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
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.phone
              else null
            end,
            'email', case
              when v_is_admin
                or r.show_contacts_to_members
                or r.id = v_viewer_rep_id
              then r.email
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
            'sort_order', p.sort_order
          )
          order by p.sort_order asc, p.name asc
        )
        from public.company_products p
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
