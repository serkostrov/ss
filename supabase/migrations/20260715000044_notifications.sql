-- In-app notifications for confirmed member users (cabinet).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'invoice_issued',
      'invoice_paid',
      'product_approved',
      'product_rejected'
    );
  end if;
end
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (btrim(title) <> '')
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_member_select on public.notifications;
create policy notifications_member_select
on public.notifications for select to authenticated
using (user_id = auth.uid());

-- Inserts/updates only via SECURITY DEFINER helpers / triggers (no direct client write).
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.notify_company_members(
  p_company_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
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
  if p_company_id is null then
    return 0;
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
  join public.representatives r on r.id = u.representative_id
  where r.company_id = p_company_id
    and u.role = 'member'
    and u.status = 'confirmed';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_company_members(
  uuid, public.notification_type, text, text, text, text, uuid, jsonb
) from public;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row public.notifications;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'notification_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- -----------------------------------------------------------------------------
-- Invoice issued (create)
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status = 'issued'::public.invoice_status then
    perform public.notify_company_members(
      new.company_id,
      'invoice_issued'::public.notification_type,
      'Выставлен новый счёт',
      format(
        'Счёт %s на сумму %s %s. %s',
        new.number,
        trim(to_char(new.amount, 'FM999999999990.00')),
        new.currency,
        new.title
      ),
      '/cabinet/invoices/' || new.id::text,
      'invoices',
      new.id,
      jsonb_build_object(
        'number', new.number,
        'amount', new.amount,
        'currency', new.currency,
        'title', new.title
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify_issued on public.invoices;
create trigger invoices_notify_issued
after insert on public.invoices
for each row
execute function public.trg_notify_invoice_issued();

-- -----------------------------------------------------------------------------
-- Invoice paid (status change)
-- -----------------------------------------------------------------------------

create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_status public.invoice_status
)
returns public.invoices
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_prev public.invoice_status;
  v_invoice public.invoices;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status not in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  ) then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  v_prev := v_invoice.status;

  update public.invoices
  set
    status = p_status,
    paid_at = case
      when p_status = 'paid'::public.invoice_status then coalesce(paid_at, now())
      else null
    end,
    updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  if p_status = 'paid'::public.invoice_status and v_prev is distinct from p_status then
    perform public.notify_company_members(
      v_invoice.company_id,
      'invoice_paid'::public.notification_type,
      'Счёт отмечен как оплаченный',
      format('Счёт %s (%s) отмечен как оплаченный.', v_invoice.number, v_invoice.title),
      '/cabinet/invoices/' || v_invoice.id::text,
      'invoices',
      v_invoice.id,
      jsonb_build_object(
        'number', v_invoice.number,
        'title', v_invoice.title
      )
    );
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.set_invoice_status(uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

-- -----------------------------------------------------------------------------
-- Product moderation result
-- -----------------------------------------------------------------------------

create or replace function public.review_company_product(
  p_product_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  update public.company_products
  set
    moderation_status = case when p_approve then 'approved'::public.product_moderation_status
      else 'rejected'::public.product_moderation_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = v_note
  where id = p_product_id
  returning * into v_product;

  if p_approve then
    perform public.notify_company_members(
      v_product.company_id,
      'product_approved'::public.notification_type,
      'Продукция одобрена',
      format('«%s» опубликована в справочнике ассоциации.', v_product.name),
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name)
    );
  else
    perform public.notify_company_members(
      v_product.company_id,
      'product_rejected'::public.notification_type,
      'Продукция отклонена',
      case
        when v_note is not null then format('«%s»: %s', v_product.name, v_note)
        else format('«%s» не прошла модерацию.', v_product.name)
      end,
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name, 'note', v_note)
    );
  end if;

  return v_product;
end;
$$;

revoke all on function public.review_company_product(uuid, boolean, text) from public;
grant execute on function public.review_company_product(uuid, boolean, text) to authenticated;
