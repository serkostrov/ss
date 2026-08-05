-- Notify the member when their registration is confirmed.

do $$
begin
  alter type public.notification_type add value if not exists 'registration_confirmed';
exception
  when duplicate_object then null;
end
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    company_id,
    type,
    title,
    body,
    link,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_user_id,
    p_company_id,
    p_type,
    p_title,
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_link, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.notify_user(
  uuid, public.notification_type, text, text, text, text, uuid, uuid, jsonb
) from public;

create or replace function public.trg_notify_member_registration_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid;
begin
  if new.role is distinct from 'member' then
    return new;
  end if;

  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;

  select r.company_id
  into v_company_id
  from public.representatives r
  where r.id = new.representative_id;

  perform public.notify_user(
    new.id,
    'registration_confirmed'::public.notification_type,
    'Заявка на регистрацию принята',
    'Ваша учётная запись подтверждена. Можно пользоваться личным кабинетом.',
    '/cabinet',
    'users',
    new.id,
    v_company_id,
    jsonb_build_object('status', new.status)
  );

  return new;
end;
$$;

drop trigger if exists users_notify_member_registration_confirmed on public.users;
create trigger users_notify_member_registration_confirmed
after update of status on public.users
for each row
execute function public.trg_notify_member_registration_confirmed();
