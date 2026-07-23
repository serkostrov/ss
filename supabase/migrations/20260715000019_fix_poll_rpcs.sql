-- =============================================================================
-- Fix poll RPCs under FORCE ROW LEVEL SECURITY + ambiguous "id"
-- =============================================================================
-- Symptoms:
--   - get_poll_results / list_poll_votes_admin: column reference "id" is ambiguous
--   - cast_vote / replace_poll_options fail RLS WITH CHECK under FORCE RLS
--
-- Fixes:
--   1) SET row_security = off on poll SECURITY DEFINER RPCs
--   2) Qualify table columns (polls.id, …) — RETURNS TABLE(id …) makes bare `id`
--      refer to the output parameter
--   3) Qualify polls.id in RLS policies used in multi-table queries
-- =============================================================================

-- --- Policies: avoid bare `id` (ambiguous when polls is joined) -------------
drop policy if exists polls_member_read on public.polls;
create policy polls_member_read
on public.polls for select to authenticated
using (
  public.is_admin()
  or public.member_can_access_poll(polls.id)
);

-- --- get_poll_results --------------------------------------------------------
create or replace function public.get_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_poll public.polls%rowtype;
  v_votes_total integer;
  v_companies_voted integer;
  v_eligible integer;
  v_first timestamptz;
  v_last timestamptz;
  v_options jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_poll from public.polls p where p.id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(distinct poll_votes.company_id)::integer,
    min(poll_votes.voted_at),
    max(poll_votes.voted_at)
  into v_votes_total, v_companies_voted, v_first, v_last
  from public.poll_votes
  where poll_votes.poll_id = p_poll_id;

  if v_poll.vote_mode = 'per_company' then
    select count(*)::integer into v_eligible
    from public.companies c
    where c.access_status = 'active'
      and c.participation_level_id in (
        select pla.participation_level_id
        from public.poll_level_access pla
        where pla.poll_id = p_poll_id
      );
  else
    select count(*)::integer into v_eligible
    from public.representatives r
    join public.companies c on c.id = r.company_id
    where r.is_active = true
      and c.access_status = 'active'
      and c.participation_level_id in (
        select pla.participation_level_id
        from public.poll_level_access pla
        where pla.poll_id = p_poll_id
      );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.option_id,
        'text', o.option_text,
        'sort_order', o.sort_order,
        'votes_count', o.votes_count,
        'share', case
          when v_votes_total > 0 then round((o.votes_count::numeric / v_votes_total::numeric), 4)
          else 0
        end
      )
      order by o.sort_order asc, o.option_text asc
    ),
    '[]'::jsonb
  )
  into v_options
  from (
    select
      po.id as option_id,
      po.text as option_text,
      po.sort_order,
      count(pv.id)::integer as votes_count
    from public.poll_options po
    left join public.poll_votes pv
      on pv.poll_option_id = po.id
     and pv.poll_id = p_poll_id
    where po.poll_id = p_poll_id
    group by po.id, po.text, po.sort_order
  ) o;

  return jsonb_build_object(
    'poll_id', v_poll.id,
    'title', v_poll.title,
    'vote_mode', v_poll.vote_mode,
    'status', v_poll.status,
    'votes_total', coalesce(v_votes_total, 0),
    'companies_voted', coalesce(v_companies_voted, 0),
    'eligible_total', coalesce(v_eligible, 0),
    'turnout_share', case
      when coalesce(v_eligible, 0) > 0
        then round((coalesce(v_votes_total, 0)::numeric / v_eligible::numeric), 4)
      else 0
    end,
    'first_voted_at', v_first,
    'last_voted_at', v_last,
    'options', v_options
  );
end;
$$;

-- --- list_poll_votes_admin ---------------------------------------------------
create or replace function public.list_poll_votes_admin(p_poll_id uuid)
returns table (
  id uuid,
  voted_at timestamptz,
  option_id uuid,
  option_text text,
  option_sort_order integer,
  representative_id uuid,
  representative_name text,
  representative_email text,
  company_id uuid,
  company_name text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls p where p.id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    pv.id,
    pv.voted_at,
    po.id,
    po.text,
    po.sort_order,
    r.id,
    r.full_name,
    r.email,
    c.id,
    c.name
  from public.poll_votes pv
  join public.poll_options po on po.id = pv.poll_option_id
  join public.representatives r on r.id = pv.representative_id
  join public.companies c on c.id = pv.company_id
  where pv.poll_id = p_poll_id
  order by pv.voted_at desc, r.full_name asc;
end;
$$;

-- --- cast_vote ---------------------------------------------------------------
create or replace function public.cast_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns public.poll_votes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.users%rowtype;
  v_poll public.polls%rowtype;
  v_company public.companies%rowtype;
  v_rep public.representatives%rowtype;
  v_vote public.poll_votes%rowtype;
begin
  select * into v_user from public.users u where u.id = auth.uid();
  if not found or v_user.role <> 'member' or v_user.status <> 'confirmed' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user.representative_id is null then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_rep from public.representatives r where r.id = v_user.representative_id;
  if not found then
    raise exception 'no_representative' using errcode = 'P0001';
  end if;

  select * into v_company from public.companies c where c.id = v_rep.company_id;
  if not found then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  if v_company.access_status <> 'active' then
    raise exception 'company_inactive' using errcode = 'P0001';
  end if;

  select * into v_poll from public.polls p where p.id = p_poll_id;
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
    select 1 from public.poll_options o
    where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'option_invalid' using errcode = 'P0001';
  end if;

  if v_poll.vote_mode = 'per_company' then
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':c:' || v_company.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes v
      where v.poll_id = p_poll_id and v.company_id = v_company.id
    ) then
      raise exception 'already_voted' using errcode = 'P0001';
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(p_poll_id::text || ':r:' || v_rep.id::text, 0)
    );
    if exists (
      select 1 from public.poll_votes v
      where v.poll_id = p_poll_id and v.representative_id = v_rep.id
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

-- --- replace_poll_options ----------------------------------------------------
create or replace function public.replace_poll_options(
  p_poll_id uuid,
  p_texts text[]
)
returns setof public.poll_options
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_status public.poll_status;
  v_text text;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.status into v_status from public.polls p where p.id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' and exists (
    select 1 from public.poll_votes v where v.poll_id = p_poll_id
  ) then
    raise exception 'options_locked' using errcode = 'P0001';
  end if;

  if p_texts is null or coalesce(array_length(p_texts, 1), 0) < 2 then
    raise exception 'options_min_two' using errcode = 'P0001';
  end if;

  delete from public.poll_options o where o.poll_id = p_poll_id;

  foreach v_text in array p_texts loop
    if trim(v_text) = '' then
      raise exception 'option_empty' using errcode = 'P0001';
    end if;
    insert into public.poll_options (poll_id, text, sort_order)
    values (p_poll_id, left(trim(v_text), 500), v_index);
    v_index := v_index + 1;
  end loop;

  return query
    select o.*
    from public.poll_options o
    where o.poll_id = p_poll_id
    order by o.sort_order asc;
end;
$$;

-- --- set_poll_levels ---------------------------------------------------------
create or replace function public.set_poll_levels(
  p_poll_id uuid,
  p_level_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls p where p.id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  delete from public.poll_level_access pla where pla.poll_id = p_poll_id;

  if p_level_ids is not null and array_length(p_level_ids, 1) is not null then
    insert into public.poll_level_access (poll_id, participation_level_id)
    select distinct p_poll_id, level_id
    from unnest(p_level_ids) as level_id
    on conflict do nothing;
  end if;
end;
$$;

-- Grants (reaffirm)
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'get_poll_results(uuid)',
    'list_poll_votes_admin(uuid)',
    'cast_vote(uuid,uuid)',
    'replace_poll_options(uuid,text[])',
    'set_poll_levels(uuid,uuid[])'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
