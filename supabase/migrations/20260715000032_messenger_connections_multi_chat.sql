-- Allow multiple messenger chats per platform within a work group.

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_id_platform_key;

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_id_platform_chat_id_key;

alter table public.messenger_connections
  add constraint messenger_connections_work_group_platform_chat_unique
  unique (work_group_id, platform, chat_id);

comment on table public.messenger_connections is
  'Telegram / Max chat bindings for a work group — several chats per platform allowed.';
