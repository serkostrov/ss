-- CASE without enum casts resolves to text and fails assignment to
-- product_category_suggestion_status (approve/reject suggestion RPC).

create or replace function public.review_product_category_suggestion(
  p_suggestion_id uuid,
  p_approve boolean,
  p_category_id uuid default null,
  p_note text default null
)
returns public.product_category_suggestions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_suggestion public.product_category_suggestions;
  v_category_id uuid := p_category_id;
  v_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_suggestion
  from public.product_category_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'suggestion_not_found' using errcode = 'P0002';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'suggestion_already_reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_category_id is null then
      select id into v_category_id
      from public.product_categories
      where lower(btrim(name)) = lower(btrim(v_suggestion.suggested_name))
      limit 1;

      if v_category_id is null then
        select coalesce(max(sort_order), -1) + 1
        into v_sort_order
        from public.product_categories;

        insert into public.product_categories (name, slug, sort_order)
        values (
          btrim(v_suggestion.suggested_name),
          'suggested-' || substr(md5(lower(btrim(v_suggestion.suggested_name))), 1, 16),
          v_sort_order
        )
        returning id into v_category_id;
      end if;
    elsif not exists (
      select 1 from public.product_categories where id = v_category_id
    ) then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    update public.company_products
    set category_id = v_category_id
    where id = v_suggestion.product_id;
  end if;

  update public.product_category_suggestions
  set
    status = case
      when p_approve then 'approved'::public.product_category_suggestion_status
      else 'rejected'::public.product_category_suggestion_status
    end,
    matched_category_id = case when p_approve then v_category_id else null end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_suggestion_id
  returning * into v_suggestion;

  return v_suggestion;
end;
$$;

revoke all on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  from public;
grant execute on function public.review_product_category_suggestion(uuid, boolean, uuid, text)
  to authenticated;
