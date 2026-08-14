-- Notify admins when moderation_status becomes pending, including changes made by BEFORE triggers.
-- "UPDATE OF moderation_status" only fires when the column is in the client SET list;
-- protect_company_product_moderation sets pending in BEFORE UPDATE without that.

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
after insert or update on public.company_products
for each row
execute function public.trg_notify_admins_product_pending();

-- Same pattern for material moderation queues.
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
after insert or update on public.material_sections
for each row
execute function public.trg_notify_admins_material_pending();

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
after insert or update on public.material_categories
for each row
execute function public.trg_notify_admins_material_category_pending();
