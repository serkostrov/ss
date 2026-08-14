-- One relay attempt per (message, target platform) — prevents duplicate Telegram/Max sends on webhook retry.

delete from public.message_relays r
using public.message_relays r2
where r.message_id = r2.message_id
  and r.target_platform = r2.target_platform
  and (
    case r.status when 'sent' then 0 when 'pending' then 1 else 2 end
    > case r2.status when 'sent' then 0 when 'pending' then 1 else 2 end
    or (
      case r.status when 'sent' then 0 when 'pending' then 1 else 2 end
      = case r2.status when 'sent' then 0 when 'pending' then 1 else 2 end
      and r.created_at > r2.created_at
    )
  );

create unique index if not exists message_relays_message_target_platform_idx
  on public.message_relays (message_id, target_platform);
