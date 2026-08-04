-- Mark own unread notifications as read by type (used when opening related cabinet tabs).

create or replace function public.mark_notifications_read_by_types(p_types public.notification_type[])
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

  if p_types is null or cardinality(p_types) = 0 then
    return 0;
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and type = any (p_types);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read_by_types(public.notification_type[]) from public;
grant execute on function public.mark_notifications_read_by_types(public.notification_type[]) to authenticated;
