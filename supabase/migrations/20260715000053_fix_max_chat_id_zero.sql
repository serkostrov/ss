-- Max DMs were sometimes bound / stored as chat_id "0". Outbound must use user_id.

with peers as (
  select distinct on (m.work_group_id)
    m.work_group_id,
    m.author_external_id as user_id
  from public.messages m
  inner join public.messenger_connections c
    on c.work_group_id = m.work_group_id
   and c.platform = 'max'
   and c.chat_id = '0'
  where m.source = 'max'
    and m.external_chat_id = '0'
    and m.author_external_id is not null
    and trim(m.author_external_id) <> ''
    and m.author_external_id <> '0'
  order by m.work_group_id, m.sent_at desc nulls last
)
update public.messenger_connections c
set
  chat_id = peers.user_id,
  last_error = null,
  bot_status = 'connected'
from peers
where c.work_group_id = peers.work_group_id
  and c.platform = 'max'
  and c.chat_id = '0';

with peers as (
  select distinct on (m.work_group_id)
    m.work_group_id,
    m.author_external_id as user_id
  from public.messages m
  where m.source = 'max'
    and m.external_chat_id = '0'
    and m.author_external_id is not null
    and trim(m.author_external_id) <> ''
    and m.author_external_id <> '0'
  order by m.work_group_id, m.sent_at desc nulls last
)
update public.messages m
set external_chat_id = peers.user_id
from peers
where m.work_group_id = peers.work_group_id
  and m.source = 'max'
  and m.external_chat_id = '0';

update public.messenger_bot_channels
set is_active = false,
    updated_at = now()
where platform = 'max'
  and external_chat_id = '0';

-- Ensure healed user ids exist as active private catalog rows.
with peers as (
  select distinct on (m.work_group_id)
    m.work_group_id,
    m.author_external_id as user_id,
    c.chat_title
  from public.messages m
  inner join public.messenger_connections c
    on c.work_group_id = m.work_group_id
   and c.platform = 'max'
   and c.chat_id = m.author_external_id
  where m.source = 'max'
    and m.author_external_id is not null
    and trim(m.author_external_id) <> ''
    and m.author_external_id <> '0'
    and (
      m.external_chat_id = m.author_external_id
      or (m.payload -> 'max' ->> 'chat_kind') = 'private'
    )
  order by m.work_group_id, m.sent_at desc nulls last
)
insert into public.messenger_bot_channels (
  platform,
  external_chat_id,
  title,
  username,
  chat_kind,
  is_active,
  last_seen_at
)
select
  'max',
  peers.user_id,
  coalesce(nullif(trim(peers.chat_title), ''), 'Личные'),
  null,
  'private',
  true,
  now()
from peers
on conflict (platform, external_chat_id) do update
set
  chat_kind = 'private',
  is_active = true,
  updated_at = now();
