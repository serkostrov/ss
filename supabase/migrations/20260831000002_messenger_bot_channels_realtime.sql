-- Live bind-chat picker: worker upserts into messenger_bot_channels, UI listens.

do $$
begin
  alter publication supabase_realtime add table public.messenger_bot_channels;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'Publication supabase_realtime not found — skip realtime for messenger_bot_channels';
end $$;
