-- Core schema for registration workflow (ТЗ §4 subset).
-- Enums, companies, representatives, users, auth sync trigger.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_status as enum ('pending', 'confirmed', 'blocked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.company_access_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null;
end $$;

create table if not exists public.participation_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  inn text,
  description text,
  phone text,
  email text,
  website text,
  address text,
  participation_level_id uuid references public.participation_levels (id) on delete set null,
  access_status public.company_access_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.representatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  position text,
  phone text,
  email text,
  pd_consent boolean not null default false,
  pd_consent_date timestamptz,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'member',
  representative_id uuid unique references public.representatives (id) on delete set null,
  status public.user_status not null default 'pending',
  full_name text,
  phone text,
  company_name_hint text,
  pd_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists users_status_idx on public.users (status);
create index if not exists users_email_idx on public.users (email);
create index if not exists representatives_company_id_idx on public.representatives (company_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists representatives_set_updated_at on public.representatives;
create trigger representatives_set_updated_at
before update on public.representatives
for each row execute function public.set_updated_at();

-- Sync auth.users → public.users on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    pd_consent_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.representatives enable row level security;
alter table public.participation_levels enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin
on public.users for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists users_update_admin on public.users;
create policy users_update_admin
on public.users for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_admin_all on public.companies;
create policy companies_admin_all
on public.companies for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_select_confirmed_member on public.companies;
create policy companies_select_confirmed_member
on public.companies for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.representatives r on r.id = u.representative_id
    where u.id = auth.uid()
      and u.status = 'confirmed'
      and r.company_id = companies.id
  )
);

drop policy if exists representatives_admin_all on public.representatives;
create policy representatives_admin_all
on public.representatives for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists representatives_select_own on public.representatives;
create policy representatives_select_own
on public.representatives for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.representative_id = representatives.id
  )
);

drop policy if exists participation_levels_select on public.participation_levels;
create policy participation_levels_select
on public.participation_levels for select to authenticated
using (true);

drop policy if exists participation_levels_admin_write on public.participation_levels;
create policy participation_levels_admin_write
on public.participation_levels for all to authenticated
using (public.is_admin())
with check (public.is_admin());
