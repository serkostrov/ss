-- Ensure messenger message/relay schema exists, then add lease fields for reclaiming
-- stale pending relays after crashes / ambiguous sends.
-- Safe to re-run on DBs that already have the full combined_schema messenger section.

create extension if not exists pg_trgm;

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
  create type public.delivery_status as enum ('received', 'stored', 'failed', 'relayed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.relay_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.messenger_chat_kind as enum (
    'channel',
    'group',
    'supergroup',
    'other',
    'private'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_content_type as enum (
    'text',
    'photo',
    'video',
    'document',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- delivery_status may exist without 'relayed' on older DBs
do $$ begin
  alter type public.delivery_status add value if not exists 'relayed';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  if to_regclass('public.work_groups') is null then
    raise exception
      'public.work_groups is missing — apply the base schema (combined_schema) before messenger migrations';
  end if;
end
$$;

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

create index if not exists messenger_connections_group_idx
  on public.messenger_connections (work_group_id);

create table if not exists public.messenger_bot_channels (
  id uuid primary key default gen_random_uuid(),
  platform public.messenger_platform not null,
  external_chat_id text not null,
  title text,
  username text,
  chat_kind public.messenger_chat_kind not null default 'other',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_chat_id)
);

create index if not exists messenger_bot_channels_platform_active_idx
  on public.messenger_bot_channels (platform, is_active);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  source public.message_source not null,
  external_chat_id text not null,
  external_message_id text not null,
  author_name text,
  author_external_id text,
  text text not null,
  content_type public.message_content_type not null default 'text',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null,
  delivery_status public.delivery_status not null default 'received',
  created_at timestamptz not null default now(),
  unique (work_group_id, source, external_message_id)
);

alter table public.messages
  add column if not exists content_type public.message_content_type not null default 'text',
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists messages_group_sent_idx
  on public.messages (work_group_id, sent_at desc);

create index if not exists messages_sent_idx
  on public.messages (sent_at desc);

create index if not exists messages_source_idx
  on public.messages (source);

create index if not exists messages_delivery_status_idx
  on public.messages (delivery_status);

create table if not exists public.message_relays (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  target_platform public.messenger_platform not null,
  target_chat_id text not null,
  target_external_message_id text,
  source_fingerprint text,
  status public.relay_status not null default 'pending',
  claimed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  relayed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists message_relays_message_idx
  on public.message_relays (message_id);

create unique index if not exists message_relays_message_target_platform_idx
  on public.message_relays (message_id, target_platform);

alter table public.message_relays
  add column if not exists source_fingerprint text,
  add column if not exists claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

comment on column public.message_relays.source_fingerprint is
  'source platform + external message id, e.g. max:mid.xxx — unique per target chat.';

comment on column public.message_relays.claimed_at is
  'When the current pending claim started; stale claims (e.g. >2 min) may be reclaimed.';

comment on column public.message_relays.attempt_count is
  'Number of send attempts for this relay row; capped by the messenger worker.';

comment on column public.message_relays.last_error is
  'Last clear or ambiguous send error message for diagnostics.';

update public.message_relays
set claimed_at = coalesce(claimed_at, created_at, now())
where status = 'pending'
  and claimed_at is null;

update public.message_relays r
set source_fingerprint = m.source::text || ':' || m.external_message_id
from public.messages m
where r.message_id = m.id
  and r.source_fingerprint is null
  and m.external_message_id is not null
  and length(trim(m.external_message_id)) > 0;

create index if not exists message_relays_pending_claimed_at_idx
  on public.message_relays (status, claimed_at)
  where status = 'pending';

create unique index if not exists message_relays_fingerprint_target_chat_idx
  on public.message_relays (source_fingerprint, target_platform, target_chat_id)
  where source_fingerprint is not null;

alter table public.messages enable row level security;
alter table public.message_relays enable row level security;
alter table public.messenger_connections enable row level security;
alter table public.messenger_bot_channels enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    drop policy if exists messages_admin_all on public.messages;
    create policy messages_admin_all
    on public.messages for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

    drop policy if exists messages_member_read on public.messages;
    create policy messages_member_read
    on public.messages for select to authenticated
    using (
      public.is_admin()
      or exists (
        select 1
        from public.users u
        join public.work_group_members wgm
          on wgm.representative_id = u.representative_id
         and wgm.work_group_id = messages.work_group_id
        where u.id = auth.uid()
          and u.role = 'member'
          and u.status = 'confirmed'
      )
    );

    drop policy if exists message_relays_admin_all on public.message_relays;
    create policy message_relays_admin_all
    on public.message_relays for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

    drop policy if exists message_relays_member_read on public.message_relays;
    create policy message_relays_member_read
    on public.message_relays for select to authenticated
    using (
      public.is_admin()
      or exists (
        select 1
        from public.messages m
        join public.users u on u.id = auth.uid()
        join public.work_group_members wgm
          on wgm.representative_id = u.representative_id
         and wgm.work_group_id = m.work_group_id
        where m.id = message_relays.message_id
          and u.role = 'member'
          and u.status = 'confirmed'
      )
    );

    drop policy if exists messenger_connections_admin_all on public.messenger_connections;
    create policy messenger_connections_admin_all
    on public.messenger_connections for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

    drop policy if exists messenger_bot_channels_admin_all on public.messenger_bot_channels;
    create policy messenger_bot_channels_admin_all
    on public.messenger_bot_channels for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when undefined_object then
    raise notice 'Publication supabase_realtime not found — skip realtime for messages';
  when duplicate_object then
    null;
end
$$;

alter table public.messages replica identity full;
