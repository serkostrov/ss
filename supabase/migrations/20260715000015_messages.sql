-- Message history tables + enum alignment for delivery/relay statuses.

create extension if not exists pg_trgm;

do $$ begin
  alter type public.delivery_status add value if not exists 'relayed';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  work_group_id uuid not null references public.work_groups (id) on delete cascade,
  source public.message_source not null,
  external_chat_id text not null,
  external_message_id text not null,
  author_name text,
  author_external_id text,
  text text not null,
  sent_at timestamptz not null,
  delivery_status public.delivery_status not null default 'received',
  created_at timestamptz not null default now(),
  unique (work_group_id, source, external_message_id)
);

create table if not exists public.message_relays (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  target_platform public.messenger_platform not null,
  target_chat_id text not null,
  target_external_message_id text,
  status public.relay_status not null default 'pending',
  relayed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_group_sent_idx
  on public.messages (work_group_id, sent_at desc);

create index if not exists messages_sent_idx
  on public.messages (sent_at desc);

create index if not exists messages_source_idx
  on public.messages (source);

create index if not exists messages_delivery_status_idx
  on public.messages (delivery_status);

create index if not exists messages_text_trgm_idx
  on public.messages using gin (text gin_trgm_ops);

create index if not exists messages_author_trgm_idx
  on public.messages using gin (author_name gin_trgm_ops);

create index if not exists message_relays_message_idx
  on public.message_relays (message_id);

alter table public.messages enable row level security;
alter table public.message_relays enable row level security;

drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all
on public.messages for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists messages_member_read on public.messages;
create policy messages_member_read
on public.messages for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.work_group_members wgm
      on wgm.representative_id = u.representative_id
     and wgm.work_group_id = messages.work_group_id
    where u.id = auth.uid()
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);

drop policy if exists message_relays_admin_all on public.message_relays;
create policy message_relays_admin_all
on public.message_relays for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists message_relays_member_read on public.message_relays;
create policy message_relays_member_read
on public.message_relays for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.messages m
    join public.users u on u.id = auth.uid()
    join public.work_group_members wgm
      on wgm.representative_id = u.representative_id
     and wgm.work_group_id = m.work_group_id
    where m.id = message_relays.message_id
      and u.role = 'member'
      and u.status = 'confirmed'
  )
);
