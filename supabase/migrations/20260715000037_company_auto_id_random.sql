-- Companies: random unique 6-digit auto_id (100000–999999), not sequential.

create or replace function public.generate_company_auto_id()
returns bigint
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  candidate bigint;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    if attempts > 200 then
      raise exception 'Could not generate unique 6-digit company auto_id';
    end if;

    -- Inclusive range 100000..999999
    candidate := 100000 + floor(random() * 900000)::bigint;

    exit when not exists (
      select 1
      from public.companies c
      where c.auto_id = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_company_auto_id() from public;
grant execute on function public.generate_company_auto_id() to authenticated, service_role;

alter table public.companies
  drop constraint if exists companies_auto_id_six_digits;

-- Protect trigger reverts auto_id when is_admin() is false (migration role).
alter table public.companies
  disable trigger companies_protect_member_columns;

-- Free current values so reassignment cannot collide with unique index.
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

-- Assign a random unique 6-digit id to each company.
do $$
declare
  r record;
  candidate bigint;
  attempts integer;
begin
  for r in
    select id
    from public.companies
    order by created_at asc, id asc
  loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      if attempts > 200 then
        raise exception 'Could not assign unique auto_id for company %', r.id;
      end if;

      candidate := 100000 + floor(random() * 900000)::bigint;

      exit when not exists (
        select 1
        from public.companies c
        where c.auto_id = candidate
      );
    end loop;

    update public.companies
    set auto_id = candidate
    where id = r.id;
  end loop;
end $$;

alter table public.companies
  enable trigger companies_protect_member_columns;

alter table public.companies
  alter column auto_id set default public.generate_company_auto_id();

alter table public.companies
  add constraint companies_auto_id_six_digits
  check (auto_id >= 100000 and auto_id <= 999999);

-- Sequence no longer drives auto_id (keep it; default uses generate_company_auto_id).
do $$
begin
  if to_regclass('public.companies_auto_id_seq') is not null then
    execute 'alter sequence public.companies_auto_id_seq owned by none';
  end if;
end $$;

comment on column public.companies.auto_id is
  'Unique random 6-digit company number (100000–999999), auto-assigned.';

comment on function public.generate_company_auto_id() is
  'Returns a random unused 6-digit company auto_id.';
