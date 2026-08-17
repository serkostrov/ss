-- Allow empty visibility/content status lists per level resource
-- (e.g. Partner level: all sections visible, no content for any status).

alter table public.participation_level_resource_access
  drop constraint if exists participation_level_resource_access_visibility_not_empty;

alter table public.participation_level_resource_access
  drop constraint if exists participation_level_resource_access_content_not_empty;

create or replace function public.validate_company_access_status_slug_array(p_slugs text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p_slugs is not null
    and (
      cardinality(p_slugs) = 0
      or not exists (
        select 1
        from unnest(p_slugs) as slug
        where not public.validate_company_access_status_slug(slug)
      )
    );
$$;
