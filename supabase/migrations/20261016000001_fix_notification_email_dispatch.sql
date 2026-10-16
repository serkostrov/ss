-- Fix notification emails: allow messenger (service_role) to sync webhook
-- settings, harden pg_net grants for the AFTER INSERT trigger, and make the
-- dispatch function more resilient (empty URL was the common silent failure).

create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    grant usage on schema net to postgres, service_role;
    grant all on all tables in schema net to postgres, service_role;
    grant all on all sequences in schema net to postgres, service_role;
    grant execute on all functions in schema net to postgres, service_role;
  end if;
exception
  when others then
    raise warning 'pg_net grants skipped: %', sqlerrm;
end
$$;

-- app_settings is revoked from clients; messenger syncs via this RPC only.
create or replace function public.sync_notification_email_webhook(
  p_url text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_secret text := coalesce(p_secret, '');
begin
  if v_url is null or v_url !~* '^https://' then
    raise exception 'invalid_webhook_url' using errcode = 'P0001';
  end if;

  if length(v_secret) < 8 then
    raise exception 'invalid_webhook_secret' using errcode = 'P0001';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values
    ('notification_email_webhook_url', v_url, now()),
    ('notification_email_webhook_secret', v_secret, now())
  on conflict (key) do update
  set
    value = excluded.value,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.sync_notification_email_webhook(text, text) from public;
grant execute on function public.sync_notification_email_webhook(text, text) to service_role;

create or replace function public.request_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_enabled boolean;
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select u.email_notifications_enabled
  into v_enabled
  from public.users u
  where u.id = new.user_id;

  if coalesce(v_enabled, false) is not true then
    return new;
  end if;

  select nullif(btrim(s.value), '')
  into v_url
  from public.app_settings s
  where s.key = 'notification_email_webhook_url';

  if v_url is null then
    raise warning
      'notification email skipped: app_settings.notification_email_webhook_url is empty (restart messenger with PUBLIC_WEBHOOK_BASE_URL + EMAIL_WEBHOOK_SECRET + SMTP* to auto-sync)';
    return new;
  end if;

  select coalesce(s.value, '')
  into v_secret
  from public.app_settings s
  where s.key = 'notification_email_webhook_secret';

  select net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apss-webhook-secret', coalesce(v_secret, '')
    ),
    timeout_milliseconds := 5000
  )
  into v_request_id;

  return new;
exception
  when others then
    raise warning 'notification email dispatch failed (%) notification_id=%: %',
      sqlstate,
      new.id,
      sqlerrm;
    return new;
end;
$$;

drop trigger if exists notifications_request_email on public.notifications;
create trigger notifications_request_email
after insert on public.notifications
for each row
execute function public.request_notification_email();
