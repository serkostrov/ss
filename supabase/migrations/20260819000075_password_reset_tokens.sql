create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id, created_at desc);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

drop policy if exists password_reset_tokens_none on public.password_reset_tokens;
create policy password_reset_tokens_none
on public.password_reset_tokens
for all
to authenticated
using (false)
with check (false);

grant all on table public.password_reset_tokens to service_role;
revoke all on table public.password_reset_tokens from anon, authenticated;
