-- Polls: CRUD foundation, options, level ACL, cast_vote RPC.

do $$ begin
  create type public.vote_mode as enum ('per_company', 'per_representative');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.poll_status as enum ('draft', 'active', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  vote_mode public.vote_mode not null default 'per_company',
  starts_at timestamptz,
  ends_at timestamptz,
  status public.poll_status not null default 'draft',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint polls_period_chk check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_level_access (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  participation_level_id uuid not null references public.participation_levels (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, participation_level_id)
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  poll_option_id uuid not null references public.poll_options (id) on delete cascade,
  representative_id uuid not null references public.representatives (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  voted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists poll_votes_per_representative_uidx
  on public.poll_votes (poll_id, representative_id);

create index if not exists poll_votes_company_idx
  on public.poll_votes (poll_id, company_id);

create index if not exists polls_status_idx on public.polls (status);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id, sort_order);
create index if not exists poll_level_access_poll_idx on public.poll_level_access (poll_id);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_level_access enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists polls_admin_all on public.polls;
create policy polls_admin_all
on public.polls for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists polls_member_read on public.polls;
create policy polls_member_read
on public.polls for select to authenticated
using (
  public.is_admin()
  or (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and exists (
      select 1
      from public.users u
      join public.representatives r on r.id = u.representative_id
      join public.companies c on c.id = r.company_id
      join public.poll_level_access pla
        on pla.poll_id = polls.id
       and pla.participation_level_id = c.participation_level_id
      where u.id = auth.uid()
        and u.role = 'member'
        and u.status = 'confirmed'
        and c.access_status = 'active'
    )
  )
);

drop policy if exists poll_options_admin_all on public.poll_options;
create policy poll_options_admin_all
on public.poll_options for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists poll_options_member_read on public.poll_options;
create policy poll_options_member_read
on public.poll_options for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.polls p
    where p.id = poll_options.poll_id
      and p.status = 'active'
  )
);

drop policy if exists poll_level_access_admin_all on public.poll_level_access;
create policy poll_level_access_admin_all
on public.poll_level_access for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists poll_level_access_member_read on public.poll_level_access;
create policy poll_level_access_member_read
on public.poll_level_access for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.polls p where p.id = poll_level_access.poll_id and p.status = 'active'
  )
);

drop policy if exists poll_votes_admin_read on public.poll_votes;
create policy poll_votes_admin_read
on public.poll_votes for select to authenticated
using (public.is_admin());

drop policy if exists poll_votes_member_read_own on public.poll_votes;
create policy poll_votes_member_read_own
on public.poll_votes for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.representative_id = poll_votes.representative_id
  )
);

-- Inserts only via cast_vote RPC (security definer).
drop policy if exists poll_votes_no_direct_write on public.poll_votes;
create policy poll_votes_no_direct_write
on public.poll_votes for insert to authenticated
with check (false);

create or replace function public.set_poll_levels(
  p_poll_id uuid,
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

  if not exists (select 1 from public.polls where id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  delete from public.poll_level_access where poll_id = p_poll_id;

  if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
    insert into public.poll_level_access (poll_id, participation_level_id)
    select distinct p_poll_id, level_id
    from unnest(p_level_ids) as level_id
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.set_poll_levels(uuid, uuid[]) to authenticated;

create or replace function public.replace_poll_options(
  p_poll_id uuid,
  p_texts text[]
)
returns setof public.poll_options
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.poll_status;
  v_text text;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status from public.polls where id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' and exists (select 1 from public.poll_votes where poll_id = p_poll_id) then
    raise exception 'options_locked' using errcode = 'P0001';
  end if;

  if p_texts is null or coalesce(array_length(p_texts, 1), 0) < 2 then
    raise exception 'options_min_two' using errcode = 'P0001';
  end if;

  delete from public.poll_options where poll_id = p_poll_id;

  foreach v_text in array p_texts loop
    if trim(v_text) = '' then
      raise exception 'option_empty' using errcode = 'P0001';
    end if;
    insert into public.poll_options (poll_id, text, sort_order)
    values (p_poll_id, left(trim(v_text), 500), v_index);
    v_index := v_index + 1;
  end loop;

  return query
    select * from public.poll_options
    where poll_id = p_poll_id
    order by sort_order asc;
end;
$$;

grant execute on function public.replace_poll_options(uuid, text[]) to authenticated;

create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if not found or v_user.role <> 'member' or v_user.status <> 'confirmed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives where id = v_user.representative_id;
  select * into v_company from public.companies where id = v_rep.company_id;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found or v_poll.status <> 'active' then
    raise exception 'poll_not_active' using errcode = 'P0001';
  end if;

  if v_poll.starts_at is not null and v_poll.starts_at > now() then
    raise exception 'poll_not_started' using errcode = 'P0001';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at < now() then
    raise exception 'poll_ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.poll_level_access pla
    where pla.poll_id = p_poll_id
      and pla.participation_level_id = v_company.participation_level_id
  ) then
    raise exception 'poll_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  if v_poll.vote_mode = 'per_company' then
    if exists (select 1 from public.poll_votes where poll_id = p_poll_id and company_id = v_company.id) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    if exists (
      select 1 from public.poll_votes
      where poll_id = p_poll_id and representative_id = v_rep.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  end if;

  insert into public.poll_votes (poll_id, poll_option_id, representative_id, company_id)
  values (p_poll_id, p_option_id, v_rep.id, v_company.id)
  returning * into v_vote;

  return v_vote;
end;
$$;

grant execute on function public.cast_vote(uuid, uuid) to authenticated;
