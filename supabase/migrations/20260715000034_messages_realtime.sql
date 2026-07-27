-- Enable Supabase Realtime for chat messages (admin/cabinet live feed).

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'Publication supabase_realtime not found — skip realtime for messages';
end $$;

-- Required for UPDATE/DELETE payloads when REPLICA IDENTITY is FULL (optional but helpful).
alter table public.messages replica identity full;
