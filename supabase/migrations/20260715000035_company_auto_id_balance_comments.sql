-- Companies: sequential auto_id, balance, admin comments.

-- =============================================================================
-- 1) auto_id + balance on companies
-- =============================================================================

alter table public.companies
  add column if not exists auto_id bigint;

alter table public.companies
  add column if not exists balance numeric(14, 2) not null default 0;

create sequence if not exists public.companies_auto_id_seq;

-- Backfill existing rows (stable order by created_at).
do $$
declare
  r record;
begin
  for r in
    select id
    from public.companies
    where auto_id is null
    order by created_at asc, id asc
  loop
    update public.companies
    set auto_id = nextval('public.companies_auto_id_seq')
    where id = r.id;
  end loop;
end $$;

alter table public.companies
  alter column auto_id set default nextval('public.companies_auto_id_seq');

alter table public.companies
  alter column auto_id set not null;

alter sequence public.companies_auto_id_seq owned by public.companies.auto_id;

create unique index if not exists companies_auto_id_unique_idx
  on public.companies (auto_id);

create index if not exists companies_balance_idx
  on public.companies (balance);

comment on column public.companies.auto_id is
  'Human-readable sequential company number (auto-assigned).';

comment on column public.companies.balance is
  'Company balance (admin-managed).';

-- Members must not change auto_id / balance / notes / access / level.
create or replace function public.protect_company_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  new.access_status := old.access_status;
  new.participation_level_id := old.participation_level_id;
  new.notes := old.notes;
  new.balance := old.balance;
  new.auto_id := old.auto_id;
  return new;
end;
$$;

-- =============================================================================
-- 2) company_comments (admin-only)
-- =============================================================================

create table if not exists public.company_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint company_comments_body_not_empty check (char_length(btrim(body)) > 0)
);

create index if not exists company_comments_company_id_created_idx
  on public.company_comments (company_id, created_at desc);

comment on table public.company_comments is
  'Admin comments / notes history for a company.';

alter table public.company_comments enable row level security;

drop policy if exists company_comments_admin_all on public.company_comments;
create policy company_comments_admin_all
on public.company_comments for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.company_comments to authenticated;
grant all on public.company_comments to service_role;
