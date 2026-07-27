-- Bot channel catalog + richer message content metadata for channel ingest.

do $$ begin
  create type public.messenger_chat_kind as enum (
    'channel',
    'group',
    'supergroup',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_content_type as enum (
    'text',
    'photo',
    'video',
    'document',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

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

comment on table public.messenger_bot_channels is
  'Channels/chats where the APSS bot is present; filled by messenger worker from membership events.';

create index if not exists messenger_bot_channels_platform_active_idx
  on public.messenger_bot_channels (platform, is_active);

create index if not exists messenger_bot_channels_kind_idx
  on public.messenger_bot_channels (chat_kind)
  where is_active;

alter table public.messages
  add column if not exists content_type public.message_content_type not null default 'text',
  add column if not exists payload jsonb not null default '{}'::jsonb;

comment on column public.messages.content_type is
  'Primary content kind; media files are not stored — caption/placeholder in text, extras in payload.';

alter table public.messenger_bot_channels enable row level security;

drop policy if exists messenger_bot_channels_admin_all on public.messenger_bot_channels;
create policy messenger_bot_channels_admin_all
on public.messenger_bot_channels for all to authenticated
using (public.is_admin())
with check (public.is_admin());
