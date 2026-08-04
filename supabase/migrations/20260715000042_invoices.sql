-- Invoices issued by admins for member companies (cabinet «Счета на оплату»).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum (
      'issued',
      'paid'
    );
  end if;
end
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  title text not null,
  amount numeric(14, 2) not null,
  currency text not null default 'RUB',
  status public.invoice_status not null default 'issued',
  due_date date,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  file_url text,
  file_name text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_title_not_blank check (btrim(title) <> ''),
  constraint invoices_number_not_blank check (btrim(number) <> ''),
  constraint invoices_amount_non_negative check (amount >= 0),
  constraint invoices_currency_not_blank check (btrim(currency) <> ''),
  constraint invoices_number_key unique (number)
);

create index if not exists invoices_company_status_idx
  on public.invoices (company_id, status, created_at desc);
create index if not exists invoices_status_due_idx
  on public.invoices (status, due_date);

alter table public.invoices enable row level security;

drop policy if exists invoices_admin_all on public.invoices;
create policy invoices_admin_all
on public.invoices for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read
on public.invoices for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and status in (
    'issued'::public.invoice_status,
    'paid'::public.invoice_status
  )
);

grant select, insert, update, delete on public.invoices to authenticated;

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

  return v_invoice;
end;
$$;

revoke all on function public.set_invoice_status(uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

-- Invoice files storage (admin write, company members read own invoices).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists invoices_storage_admin_all on storage.objects;
create policy invoices_storage_admin_all
on storage.objects for all to authenticated
using (
  bucket_id = 'invoices'
  and public.is_admin()
)
with check (
  bucket_id = 'invoices'
  and public.is_admin()
);

drop policy if exists invoices_storage_member_read on storage.objects;
create policy invoices_storage_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'invoices'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.invoices i
      where i.file_url = name
        and i.company_id = public.current_company_id()
        and public.is_confirmed_member()
    )
  )
);
