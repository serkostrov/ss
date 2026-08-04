-- Align invoices with final fields if 000042 was applied earlier.

alter table public.invoices
  add column if not exists file_url text,
  add column if not exists file_name text;

-- Drop unused description if present.
alter table public.invoices
  drop column if exists description;

-- Ensure issued_at is always set.
update public.invoices
set issued_at = coalesce(issued_at, created_at, now())
where issued_at is null;

alter table public.invoices
  alter column issued_at set default now();

do $$
begin
  alter table public.invoices alter column issued_at set not null;
exception
  when others then null;
end
$$;

-- Normalize legacy statuses to issued/paid when those enum values still exist.
do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'invoice_status'
      and e.enumlabel = 'draft'
  ) then
    execute $sql$
      update public.invoices
      set status = 'issued'::public.invoice_status
      where status::text in ('draft', 'cancelled')
    $sql$;
  end if;
end
$$;

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

  if p_status::text not in ('issued', 'paid') then
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
      when p_status::text = 'paid' then coalesce(paid_at, now())
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

-- Drop legacy 3-arg overload / number generator if present.
drop function if exists public.set_invoice_status(uuid, public.invoice_status, text);
drop function if exists public.next_invoice_number();

drop policy if exists invoices_member_read on public.invoices;
create policy invoices_member_read
on public.invoices for select to authenticated
using (
  public.is_confirmed_member()
  and company_id = public.current_company_id()
  and status::text in ('issued', 'paid')
);

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
