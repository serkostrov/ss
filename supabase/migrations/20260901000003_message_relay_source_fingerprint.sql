-- Cross-row relay idempotency: the same source message must not be delivered twice
-- to the same target chat (parallel webhooks, two work groups sharing chats).

alter table public.message_relays
  add column if not exists source_fingerprint text;

comment on column public.message_relays.source_fingerprint is
  'source platform + external message id, e.g. max:mid.xxx — unique per target chat.';

update public.message_relays r
set source_fingerprint = m.source::text || ':' || m.external_message_id
from public.messages m
where r.message_id = m.id
  and r.source_fingerprint is null
  and m.external_message_id is not null
  and length(trim(m.external_message_id)) > 0;

delete from public.message_relays r
using public.message_relays r2
where r.source_fingerprint is not null
  and r2.source_fingerprint is not null
  and r.source_fingerprint = r2.source_fingerprint
  and r.target_platform = r2.target_platform
  and r.target_chat_id = r2.target_chat_id
  and r.id <> r2.id
  and (
    case r.status when 'sent' then 0 when 'pending' then 1 else 2 end
    > case r2.status when 'sent' then 0 when 'pending' then 1 else 2 end
    or (
      case r.status when 'sent' then 0 when 'pending' then 1 else 2 end
      = case r2.status when 'sent' then 0 when 'pending' then 1 else 2 end
      and r.created_at > r2.created_at
    )
  );

create unique index if not exists message_relays_fingerprint_target_chat_idx
  on public.message_relays (source_fingerprint, target_platform, target_chat_id)
  where source_fingerprint is not null;
