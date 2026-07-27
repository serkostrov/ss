-- One messenger chat per platform per work group (revert multi-chat).

-- Keep the earliest binding when duplicates exist.
delete from public.messenger_connections a
using public.messenger_connections b
where a.work_group_id = b.work_group_id
  and a.platform = b.platform
  and a.ctid > b.ctid;

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_platform_chat_unique;

alter table public.messenger_connections
  drop constraint if exists messenger_connections_work_group_id_platform_key;

alter table public.messenger_connections
  add constraint messenger_connections_work_group_id_platform_key
  unique (work_group_id, platform);

comment on table public.messenger_connections is
  'Telegram / Max chat bindings — one chat per platform per work group.';
