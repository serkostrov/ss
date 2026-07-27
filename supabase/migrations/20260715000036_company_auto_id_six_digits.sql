-- Companies: unique 6-digit auto_id (100000–999999).
-- Must disable member-column protect trigger: without auth.uid()/is_admin()
-- it silently reverts auto_id on UPDATE.

alter table public.companies
  drop constraint if exists companies_auto_id_six_digits;

alter table public.companies
  disable trigger companies_protect_member_columns;

-- Phase 1: free unique values (negatives cannot collide with final 6-digit range).
with numbered as (
  select
    id,
    -row_number() over (order by auto_id asc, created_at asc, id asc) as tmp_auto_id
  from public.companies
)
update public.companies c
set auto_id = numbered.tmp_auto_id
from numbered
where c.id = numbered.id;

-- Phase 2: assign sequential 6-digit IDs starting at 100000.
with numbered as (
  select
    id,
    100000 + (row_number() over (order by auto_id desc, created_at asc, id asc) - 1) as new_auto_id
  from public.companies
)
update public.companies c
set auto_id = numbered.new_auto_id
from numbered
where c.id = numbered.id;

alter table public.companies
  enable trigger companies_protect_member_columns;

-- Next nextval() must yield max(auto_id)+1 (or 100000 if empty).
select setval(
  'public.companies_auto_id_seq',
  greatest(
    coalesce((select max(auto_id) from public.companies), 99999),
    99999
  )
);

alter table public.companies
  alter column auto_id set default nextval('public.companies_auto_id_seq');

alter table public.companies
  add constraint companies_auto_id_six_digits
  check (auto_id >= 100000 and auto_id <= 999999);

comment on column public.companies.auto_id is
  'Unique 6-digit company number (100000–999999), auto-assigned.';
