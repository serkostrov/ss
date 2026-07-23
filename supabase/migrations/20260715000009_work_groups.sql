-- Work groups + members + links + messenger_connections (Telegram/Max ready).

do $$ begin
  create type public.work_group_status as enum ('active', 'paused', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.messenger_platform as enum ('telegram', 'max');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.bot_status as enum ('pending', 'connected', 'error');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_source as enum ('telegram', 'max');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.delivery_status as enum ('received', 'stored', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.relay_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.work_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  responsible_representative_id uuid references public.representatives (id) on delete set null,
  status public.work_group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_group_members (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  representative_id uuid not null references public.representatives (id) on delete cascade,
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (work_group_id, representative_id)
);

create table if not exists public.work_group_links (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  title text not null,
  url text,
  file_url text,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Future Telegram / Max bot bindings (one row per platform per group).
create table if not exists public.messenger_connections (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  platform public.messenger_platform not null,
  chat_id text not null,
  chat_title text,
  bot_status public.bot_status not null default 'pending',
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (work_group_id, platform)
);

create index if not exists work_groups_status_idx on public.work_groups (status);
create index if not exists work_groups_responsible_idx
  on public.work_groups (responsible_representative_id);
create index if not exists work_group_members_group_idx
  on public.work_group_members (work_group_id);
create index if not exists work_group_members_rep_idx
  on public.work_group_members (representative_id);
create index if not exists work_group_links_group_idx
  on public.work_group_links (work_group_id, sort_order);
create index if not exists messenger_connections_group_idx
  on public.messenger_connections (work_group_id);

drop trigger if exists work_groups_set_updated_at on public.work_groups;
create trigger work_groups_set_updated_at
before update on public.work_groups
for each row execute function public.set_updated_at();

alter table public.work_groups enable row level security;
alter table public.work_group_members enable row level security;
alter table public.work_group_links enable row level security;
alter table public.messenger_connections enable row level security;

drop policy if exists work_groups_admin_all on public.work_groups;
create policy work_groups_admin_all
on public.work_groups for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_groups_member_read on public.work_groups;
create policy work_groups_member_read
on public.work_groups for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.work_group_members m
      on m.representative_id = u.representative_id
     and m.work_group_id = work_groups.id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
      and work_groups.status <> 'archived'
  )
);

drop policy if exists work_group_members_admin_all on public.work_group_members;
create policy work_group_members_admin_all
on public.work_group_members for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_group_members_member_read on public.work_group_members;
create policy work_group_members_member_read
on public.work_group_members for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
      and u.representative_id = work_group_members.representative_id
  )
);

drop policy if exists work_group_links_admin_all on public.work_group_links;
create policy work_group_links_admin_all
on public.work_group_links for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_group_links_member_read on public.work_group_links;
create policy work_group_links_member_read
on public.work_group_links for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.work_group_members m
      on m.representative_id = u.representative_id
     and m.work_group_id = work_group_links.work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

drop policy if exists messenger_connections_admin_all on public.messenger_connections;
create policy messenger_connections_admin_all
on public.messenger_connections for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Members may see connection status of their groups (not secrets — chat_id is operational).
drop policy if exists messenger_connections_member_read on public.messenger_connections;
create policy messenger_connections_member_read
on public.messenger_connections for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.work_group_members m
      on m.representative_id = u.representative_id
     and m.work_group_id = messenger_connections.work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

-- Storage bucket reserved for work-group file links (worker / admin uploads later).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-group-files',
  'work-group-files',
  false,
  52428800,
  null
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists work_group_files_admin_all on storage.objects;
create policy work_group_files_admin_all
on storage.objects for all to authenticated
using (bucket_id = 'work-group-files' and public.is_admin())
with check (bucket_id = 'work-group-files' and public.is_admin());
