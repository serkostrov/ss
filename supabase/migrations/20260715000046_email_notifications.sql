-- Email digests for in-app notifications (smtp.bz via Edge Function).

alter table public.users
  add column if not exists email_notifications_enabled boolean not null default true;

comment on column public.users.email_notifications_enabled is
  'When true, duplicate in-app notifications to the user email via smtp.bz.';

-- Runtime config for DB → Edge webhook (set after deploy).
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- No direct client access; only SECURITY DEFINER helpers / service role.
revoke all on table public.app_settings from public, anon, authenticated;

insert into public.app_settings (key, value)
values
  ('notification_email_webhook_url', ''),
  ('notification_email_webhook_secret', '')
on conflict (key) do nothing;

-- =============================================================================
-- handle_new_user — persist registration opt-in
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    status,
    full_name,
    phone,
    company_name_hint,
    company_inn_hint,
    pd_consent_at,
    show_contacts_to_members,
    email_notifications_enabled,
    telegram_username,
    max_username
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'member',
    'pending',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'company_name_hint', ''),
    nullif(new.raw_user_meta_data->>'company_inn_hint', ''),
    case
      when (new.raw_user_meta_data->>'pd_consent')::boolean is true
        then coalesce((new.raw_user_meta_data->>'pd_consent_at')::timestamptz, now())
      else null
    end,
    coalesce((new.raw_user_meta_data->>'show_contacts_to_members')::boolean, false),
    coalesce((new.raw_user_meta_data->>'email_notifications_enabled')::boolean, true),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'telegram_username', '')), '@'),
      ''
    ),
    nullif(
      ltrim(trim(coalesce(new.raw_user_meta_data->>'max_username', '')), '@'),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =============================================================================
-- Toggle for confirmed members
-- =============================================================================

create or replace function public.set_own_email_notifications(p_enabled boolean)
returns public.users
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.users
  set email_notifications_enabled = coalesce(p_enabled, false)
  where id = auth.uid()
    and role = 'member'
    and status = 'confirmed'
  returning * into v_user;

  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

revoke all on function public.set_own_email_notifications(boolean) from public;
grant execute on function public.set_own_email_notifications(boolean) to authenticated;

-- =============================================================================
-- Dispatch email after notification insert (pg_net → Edge Function)
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.request_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_enabled boolean;
  v_url text;
  v_secret text;
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
    return new;
  end if;

  select coalesce(s.value, '')
  into v_secret
  from public.app_settings s
  where s.key = 'notification_email_webhook_secret';

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-apss-webhook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
exception
  when others then
    raise warning 'notification email dispatch failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists notifications_request_email on public.notifications;
create trigger notifications_request_email
after insert on public.notifications
for each row
execute function public.request_notification_email();
