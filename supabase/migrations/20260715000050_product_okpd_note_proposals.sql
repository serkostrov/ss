-- Member proposals for custom OKPD 2 codes and product notes.
-- On product approval, proposals are upserted into settings dictionaries.

alter table public.company_products
  add column if not exists proposed_okpd_code text,
  add column if not exists proposed_okpd_title text,
  add column if not exists proposed_note_name text;

alter table public.company_products
  drop constraint if exists company_products_proposed_okpd_pair;

alter table public.company_products
  add constraint company_products_proposed_okpd_pair
  check (
    (proposed_okpd_code is null and proposed_okpd_title is null)
    or (
      proposed_okpd_code is not null
      and btrim(proposed_okpd_code) <> ''
      and proposed_okpd_title is not null
      and btrim(proposed_okpd_title) <> ''
    )
  );

alter table public.company_products
  drop constraint if exists company_products_proposed_note_not_blank;

alter table public.company_products
  add constraint company_products_proposed_note_not_blank
  check (
    proposed_note_name is null
    or btrim(proposed_note_name) <> ''
  );

-- Resolve / create dictionary rows from product proposals; mutates NEW in BEFORE trigger.
create or replace function public.resolve_company_product_proposals()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_code text;
  v_title text;
  v_note text;
  v_okpd_id uuid;
  v_note_id uuid;
  v_parent_id uuid;
  v_level integer;
  v_sort integer;
begin
  -- Only materialize into dictionaries when the product is approved.
  if new.moderation_status is distinct from 'approved'::public.product_moderation_status then
    return new;
  end if;

  v_code := nullif(btrim(coalesce(new.proposed_okpd_code, '')), '');
  v_title := nullif(btrim(coalesce(new.proposed_okpd_title, '')), '');
  v_note := nullif(btrim(coalesce(new.proposed_note_name, '')), '');

  if v_code is not null and v_title is not null then
    select id into v_okpd_id
    from public.okpd2_codes
    where code = v_code
    limit 1;

    if v_okpd_id is null then
      -- Parent = longest existing code that is a proper prefix (dot boundary).
      select id into v_parent_id
      from public.okpd2_codes
      where v_code like code || '.%'
      order by length(code) desc
      limit 1;

      v_level := cardinality(string_to_array(v_code, '.')) + 1;

      select coalesce(max(sort_order), -1) + 1 into v_sort
      from public.okpd2_codes
      where parent_id is not distinct from v_parent_id;

      insert into public.okpd2_codes (code, title, parent_id, level, sort_order, is_active)
      values (v_code, v_title, v_parent_id, v_level, v_sort, true)
      on conflict (code) do update
        set
          title = excluded.title,
          is_active = true,
          updated_at = now()
      returning id into v_okpd_id;
    else
      update public.okpd2_codes
      set
        title = v_title,
        is_active = true,
        updated_at = now()
      where id = v_okpd_id
        and (title is distinct from v_title or is_active is not true);
    end if;

    new.okpd_code_id := v_okpd_id;
    new.name := left(v_title, 200);
    new.proposed_okpd_code := null;
    new.proposed_okpd_title := null;
  end if;

  if v_note is not null then
    insert into public.product_notes (name, sort_order, is_active)
    values (
      v_note,
      (select coalesce(max(sort_order), -1) + 1 from public.product_notes),
      true
    )
    on conflict (name) do update
      set is_active = true
    returning id into v_note_id;

    new.note_id := v_note_id;
    new.proposed_note_name := null;
  end if;

  return new;
end;
$$;

drop trigger if exists company_products_resolve_proposals on public.company_products;
create trigger company_products_resolve_proposals
before insert or update on public.company_products
for each row execute function public.resolve_company_product_proposals();

-- Re-moderation when OKPD / note / proposals change.
create or replace function public.protect_company_product_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'approved';
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      new.review_note := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if
    new.name is distinct from old.name
    or new.url is distinct from old.url
    or new.category_id is distinct from old.category_id
    or new.okpd_code_id is distinct from old.okpd_code_id
    or new.note_id is distinct from old.note_id
    or new.proposed_okpd_code is distinct from old.proposed_okpd_code
    or new.proposed_okpd_title is distinct from old.proposed_okpd_title
    or new.proposed_note_name is distinct from old.proposed_note_name
    or new.is_active is distinct from old.is_active
  then
    new.moderation_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  else
    new.moderation_status := old.moderation_status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

-- Keep notifications + apply proposals via UPDATE (resolve trigger runs first).
create or replace function public.review_company_product(
  p_product_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.company_products
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_product public.company_products;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_product
  from public.company_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  update public.company_products
  set
    moderation_status = case when p_approve then 'approved'::public.product_moderation_status
      else 'rejected'::public.product_moderation_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = v_note
  where id = p_product_id
  returning * into v_product;

  if p_approve then
    perform public.notify_company_members(
      v_product.company_id,
      'product_approved'::public.notification_type,
      'Продукция одобрена',
      format('«%s» опубликована в справочнике ассоциации.', v_product.name),
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name)
    );
  else
    perform public.notify_company_members(
      v_product.company_id,
      'product_rejected'::public.notification_type,
      'Продукция отклонена',
      case
        when v_note is not null then format('«%s»: %s', v_product.name, v_note)
        else format('«%s» не прошла модерацию.', v_product.name)
      end,
      '/cabinet/account?tab=company',
      'company_products',
      v_product.id,
      jsonb_build_object('name', v_product.name, 'note', v_note)
    );
  end if;

  return v_product;
end;
$$;

revoke all on function public.review_company_product(uuid, boolean, text) from public;
grant execute on function public.review_company_product(uuid, boolean, text) to authenticated;
