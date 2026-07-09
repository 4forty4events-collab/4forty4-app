-- Curator Composer: a candidate pool for deterministic day-composition. Returns
-- non-stub venues in a market WITH usable lat/lng (st_x/st_y of the geography
-- column) so the edge function can order stops by proximity. Radius-filters around
-- a passed centroid but KEEPS venues that have no location (they just carry null
-- coords and are placed neutrally), so a thin catalog is never starved.
create or replace function public.composer_pool(
  p_market text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m double precision default null,
  p_limit integer default 150
)
returns table (
  id uuid, name text, category text, tags text[], description text,
  rating double precision, review_count integer, price_per_person numeric,
  lat double precision, lng double precision, dist_m double precision
)
language sql stable security definer set search_path = public, extensions as $$
  with p as (
    select case when p_lat is not null and p_lng is not null
                then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as pt
  )
  select v.id, v.name, v.category, v.tags, v.description,
         v.rating::double precision, v.review_count, v.price_per_person,
         case when v.location is not null then st_y(v.location::geometry) end as lat,
         case when v.location is not null then st_x(v.location::geometry) end as lng,
         case when v.location is not null and (select pt from p) is not null
              then st_distance(v.location, (select pt from p)) end as dist_m
  from public.venues v
  where v.market = p_market
    and v.is_stub = false
    and (
      p_radius_m is null
      or (select pt from p) is null
      or v.location is null
      or st_dwithin(v.location, (select pt from p), p_radius_m)
    )
  order by v.rating desc nulls last, v.review_count desc nulls last
  limit greatest(coalesce(p_limit, 150), 1);
$$;

revoke execute on function public.composer_pool(text, double precision, double precision, double precision, integer) from public;
grant  execute on function public.composer_pool(text, double precision, double precision, double precision, integer) to anon, authenticated, service_role;
