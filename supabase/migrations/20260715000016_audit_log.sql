-- Audit log for administrative operations.

create extension if not exists pg_trgm;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

create index if not exists audit_log_action_idx
  on public.audit_log (action);

create index if not exists audit_log_user_idx
  on public.audit_log (user_id);

create index if not exists audit_log_action_trgm_idx
  on public.audit_log using gin (action gin_trgm_ops);

create index if not exists audit_log_entity_type_trgm_idx
  on public.audit_log using gin (entity_type gin_trgm_ops);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select
on public.audit_log for select to authenticated
using (public.is_admin());

-- Direct inserts blocked; use write_audit_log RPC.
drop policy if exists audit_log_no_direct_insert on public.audit_log;
create policy audit_log_no_direct_insert
on public.audit_log for insert to authenticated
with check (false);

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_payload jsonb default null
)
returns public.audit_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.audit_log%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- Only admins write admin audit; members should not fill this journal.
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action is null or trim(p_action) = '' then
    raise exception 'action_required' using errcode = 'P0001';
  end if;
  if p_entity_type is null or trim(p_entity_type) = '' then
    raise exception 'entity_type_required' using errcode = 'P0001';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    left(trim(p_action), 120),
    left(trim(p_entity_type), 120),
    case when p_entity_id is null or trim(p_entity_id) = '' then null else left(trim(p_entity_id), 120) end,
    p_payload
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.write_audit_log(text, text, text, jsonb) to authenticated;
