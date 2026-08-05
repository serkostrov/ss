-- Admin in-app notifications for key moderation / registration events.

do $$
begin
  alter type public.notification_type add value if not exists 'registration_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'product_moderation_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'category_suggestion_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'material_moderation_pending';
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter type public.notification_type add value if not exists 'material_category_pending';
exception
  when duplicate_object then null;
end
$$;

-- Notify all non-blocked admins.
create or replace function public.notify_admins(
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
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
  select
    u.id,
    p_company_id,
    p_type,
    p_title,
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_link, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  from public.users u
  where u.role = 'admin'
    and u.status is distinct from 'blocked';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_admins(
  public.notification_type, text, text, text, text, uuid, uuid, jsonb
) from public;

-- Email toggle: confirmed members OR non-blocked admins.
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
    and (
      (role = 'member' and status = 'confirmed')
      or (role = 'admin' and status is distinct from 'blocked')
    )
  returning * into v_user;

  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

revoke all on function public.set_own_email_notifications(boolean) from public;
grant execute on function public.set_own_email_notifications(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- New registration (pending member)
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_registration()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.role = 'member' and new.status = 'pending' then
    perform public.notify_admins(
      'registration_pending'::public.notification_type,
      'Новая заявка на регистрацию',
      format(
        '%s (%s)',
        coalesce(nullif(btrim(new.full_name), ''), 'Без имени'),
        coalesce(nullif(btrim(new.email), ''), 'без email')
      ),
      '/admin/registrations',
      'users',
      new.id,
      null,
      jsonb_build_object(
        'email', new.email,
        'full_name', new.full_name,
        'company_name_hint', new.company_name_hint
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists users_notify_admins_registration on public.users;
create trigger users_notify_admins_registration
after insert on public.users
for each row
execute function public.trg_notify_admins_registration();

-- -----------------------------------------------------------------------------
-- Product moderation queue
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_product_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_name text;
begin
  if new.moderation_status is distinct from 'pending'::public.product_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.product_moderation_status then
    return new;
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = new.company_id;

  perform public.notify_admins(
    'product_moderation_pending'::public.notification_type,
    'Продукция на модерации',
    format(
      '«%s» — %s',
      coalesce(nullif(btrim(new.name), ''), 'Без названия'),
      coalesce(v_company_name, 'компания')
    ),
    '/admin/registrations',
    'company_products',
    new.id,
    new.company_id,
    jsonb_build_object('name', new.name, 'company_id', new.company_id)
  );

  return new;
end;
$$;

drop trigger if exists company_products_notify_admins_pending on public.company_products;
create trigger company_products_notify_admins_pending
after insert or update of moderation_status on public.company_products
for each row
execute function public.trg_notify_admins_product_pending();

-- -----------------------------------------------------------------------------
-- Product category suggestion
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_category_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status is distinct from 'pending'::public.product_category_suggestion_status then
    return new;
  end if;

  perform public.notify_admins(
    'category_suggestion_pending'::public.notification_type,
    'Предложена категория продукции',
    format('«%s»', coalesce(nullif(btrim(new.suggested_name), ''), 'Без названия')),
    '/admin/registrations',
    'product_category_suggestions',
    new.id,
    new.company_id,
    jsonb_build_object('suggested_name', new.suggested_name, 'product_id', new.product_id)
  );

  return new;
end;
$$;

drop trigger if exists product_category_suggestions_notify_admins on public.product_category_suggestions;
create trigger product_category_suggestions_notify_admins
after insert on public.product_category_suggestions
for each row
execute function public.trg_notify_admins_category_suggestion();

-- -----------------------------------------------------------------------------
-- Material section moderation
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_material_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.moderation_status is distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  perform public.notify_admins(
    'material_moderation_pending'::public.notification_type,
    'Материал на модерации',
    format('«%s»', coalesce(nullif(btrim(new.title), ''), 'Без названия')),
    '/admin/registrations',
    'material_sections',
    new.id,
    null,
    jsonb_build_object('title', new.title, 'slug', new.slug)
  );

  return new;
end;
$$;

drop trigger if exists material_sections_notify_admins_pending on public.material_sections;
create trigger material_sections_notify_admins_pending
after insert or update of moderation_status on public.material_sections
for each row
execute function public.trg_notify_admins_material_pending();

-- -----------------------------------------------------------------------------
-- Material category moderation
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admins_material_category_pending()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.moderation_status is distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status is not distinct from 'pending'::public.material_moderation_status then
    return new;
  end if;

  perform public.notify_admins(
    'material_category_pending'::public.notification_type,
    'Категория материала на модерации',
    format('«%s»', coalesce(nullif(btrim(new.name), ''), 'Без названия')),
    '/admin/registrations',
    'material_categories',
    new.id,
    null,
    jsonb_build_object('name', new.name)
  );

  return new;
end;
$$;

drop trigger if exists material_categories_notify_admins_pending on public.material_categories;
create trigger material_categories_notify_admins_pending
after insert or update of moderation_status on public.material_categories
for each row
execute function public.trg_notify_admins_material_category_pending();
