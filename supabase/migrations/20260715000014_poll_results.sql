-- Admin poll results: aggregate RPC + votes listing + covering index.

create index if not exists poll_votes_poll_option_idx
  on public.poll_votes (poll_id, poll_option_id);

create or replace function public.get_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  select * into v_poll from public.polls where id = p_poll_id;
  if not found then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(distinct company_id)::integer,
    min(voted_at),
    max(voted_at)
  into v_votes_total, v_companies_voted, v_first, v_last
  from public.poll_votes
  where poll_id = p_poll_id;

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
        'id', o.id,
        'text', o.text,
        'sort_order', o.sort_order,
        'votes_count', o.votes_count,
        'share', case
          when v_votes_total > 0 then round((o.votes_count::numeric / v_votes_total::numeric), 4)
          else 0
        end
      )
      order by o.sort_order asc, o.text asc
    ),
    '[]'::jsonb
  )
  into v_options
  from (
    select
      po.id,
      po.text,
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

grant execute on function public.get_poll_results(uuid) to authenticated;

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
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.polls where id = p_poll_id) then
    raise exception 'poll_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    pv.id,
    pv.voted_at,
    po.id as option_id,
    po.text as option_text,
    po.sort_order as option_sort_order,
    r.id as representative_id,
    r.full_name as representative_name,
    r.email as representative_email,
    c.id as company_id,
    c.name as company_name
  from public.poll_votes pv
  join public.poll_options po on po.id = pv.poll_option_id
  join public.representatives r on r.id = pv.representative_id
  join public.companies c on c.id = pv.company_id
  where pv.poll_id = p_poll_id
  order by pv.voted_at desc, r.full_name asc;
end;
$$;

grant execute on function public.list_poll_votes_admin(uuid) to authenticated;
