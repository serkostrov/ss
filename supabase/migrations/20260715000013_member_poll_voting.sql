-- Member voting: company vote visibility, cast_vote race hardening.

drop policy if exists poll_votes_member_read_own on public.poll_votes;
create policy poll_votes_member_read_own
on public.poll_votes for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.representatives r on r.id = u.representative_id
    join public.polls p on p.id = poll_votes.poll_id
    where u.id = auth.uid()
      and u.role = 'member'
      and (
        poll_votes.representative_id = u.representative_id
        or (
          p.vote_mode = 'per_company'
          and poll_votes.company_id = r.company_id
        )
      )
  )
);

-- Options only for polls the member can see (active + ACL via polls RLS pattern).
drop policy if exists poll_options_member_read on public.poll_options;
create policy poll_options_member_read
on public.poll_options for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.polls p
    join public.users u on u.id = auth.uid()
    join public.representatives r on r.id = u.representative_id
    join public.companies c on c.id = r.company_id
    join public.poll_level_access pla
      on pla.poll_id = p.id
     and pla.participation_level_id = c.participation_level_id
    where p.id = poll_options.poll_id
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and u.role = 'member'
      and u.status = 'confirmed'
      and c.access_status = 'active'
  )
);

create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if not found or v_user.role <> 'member' or v_user.status <> 'confirmed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives where id = v_user.representative_id;
  if not found then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_company from public.companies where id = v_rep.company_id;
  if not found then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found or v_poll.status <> 'active' then
    raise exception 'poll_not_active' using errcode = 'P0001';
  end if;

  if v_poll.starts_at is not null and v_poll.starts_at > now() then
    raise exception 'poll_not_started' using errcode = 'P0001';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at < now() then
    raise exception 'poll_ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.poll_level_access pla
    where pla.poll_id = p_poll_id
      and pla.participation_level_id = v_company.participation_level_id
  ) then
    raise exception 'poll_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  -- Serialize concurrent votes for the same poll+scope (covers per_company races).
  if v_poll.vote_mode = 'per_company' then
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':c:' || v_company.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes
      where poll_id = p_poll_id and company_id = v_company.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':r:' || v_rep.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes
      where poll_id = p_poll_id and representative_id = v_rep.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.poll_votes (poll_id, poll_option_id, representative_id, company_id)
    values (p_poll_id, p_option_id, v_rep.id, v_company.id)
    returning * into v_vote;
  exception
    when unique_violation then
      raise exception 'already_voted' using errcode = 'P0001';
  end;

  return v_vote;
end;
$$;

grant execute on function public.cast_vote(uuid, uuid) to authenticated;
