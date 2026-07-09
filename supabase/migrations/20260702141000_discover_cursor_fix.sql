-- Fix keyset pagination boundary duplicates. The cursor compares sort_v with '=',
-- but a float (raw epoch seconds, sub-meter distance) doesn't survive the
-- jsonb -> JS double -> jsonb round-trip bit-exactly, so the tiebreak misfired
-- and repeated a row across the page boundary. Make sort_v INTEGER-VALUED
-- (epoch-millis, whole meters, rating*1000, similarity*1e6) — integers < 2^53 are
-- exact in both JSON and JS doubles, so cursor equality is reliable.
create or replace function public.discover(
  p_market text,
  p_categories text[] default null,
  p_text text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m double precision default null,
  p_kinds text[] default null,
  p_sort text default 'recent',
  p_cursor jsonb default null,
  p_limit integer default 20
)
returns table (kind text, item jsonb, distance_m double precision, sort_v double precision, out_id uuid)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_point  geography := case when p_lat is not null and p_lng is not null
                          then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end;
  v_asc    boolean := (p_sort = 'distance');
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_norm   text := case when p_text is not null and length(btrim(p_text)) > 0
                     then public.f_unaccent(lower(btrim(p_text))) end;
  v_cur_v  double precision := case when p_cursor ? 'v'  then (p_cursor->>'v')::double precision end;
  v_cur_id uuid             := case when p_cursor ? 'id' then (p_cursor->>'id')::uuid end;
begin
  return query
  with cand as (
    select 'venue'::text as kind, v.id, to_jsonb(v.*) as item,
           case when v_point is not null and v.location is not null
             then st_distance(v.location, v_point) end as dist,
           v.created_at, v.rating::double precision as rating, v.review_count,
           case when v_norm is not null then greatest(
             similarity(public.f_unaccent(lower(v.name)), v_norm),
             similarity(public.f_unaccent(lower(coalesce(v.description, ''))), v_norm)) end as sim
    from public.venues v
    where v.market = p_market
      and v.is_stub = false
      and (p_kinds is null or 'venue' = any(p_kinds))
      and (p_categories is null or v.category = any(p_categories))
      and (v_point is null or p_radius_m is null
           or (v.location is not null and st_dwithin(v.location, v_point, p_radius_m)))
      and (v_norm is null
           or public.f_unaccent(lower(v.name)) % v_norm
           or public.f_unaccent(lower(coalesce(v.description, ''))) % v_norm)
    union all
    select 'event'::text as kind, e.id,
           to_jsonb(e.*) || jsonb_build_object('venues', jsonb_build_object('name', ev.name)) as item,
           case when v_point is not null and ev.location is not null
             then st_distance(ev.location, v_point) end as dist,
           e.created_at, null::double precision as rating, null::integer as review_count,
           case when v_norm is not null
             then similarity(public.f_unaccent(lower(e.title)), v_norm) end as sim
    from public.events e
    left join public.venues ev on ev.id = e.venue_id
    where e.market = p_market
      and e.start_time >= now()
      and (p_kinds is null or 'event' = any(p_kinds))
      and (p_categories is null or e.category = any(p_categories))
      and (v_point is null or p_radius_m is null
           or (ev.location is not null and st_dwithin(ev.location, v_point, p_radius_m)))
      and (v_norm is null or public.f_unaccent(lower(e.title)) % v_norm)
  ),
  scored as (
    select c.*, case p_sort
      when 'distance'  then round(coalesce(c.dist, 1e12))
      when 'rating'    then round(coalesce(c.rating, -1) * 1000)
      when 'trending'  then round(coalesce(c.rating, 0) * ln(coalesce(c.review_count, 0) + 1) * 1000)
      when 'relevance' then round(coalesce(c.sim, 0)::numeric * 1000000)
      else floor(extract(epoch from c.created_at) * 1000)
    end::double precision as sort_v
    from cand c
  )
  select s.kind, s.item, s.dist, s.sort_v, s.id
  from scored s
  where p_cursor is null
     or (v_asc     and (s.sort_v > v_cur_v or (s.sort_v = v_cur_v and s.id > v_cur_id)))
     or (not v_asc and (s.sort_v < v_cur_v or (s.sort_v = v_cur_v and s.id < v_cur_id)))
  order by
    case when v_asc then s.sort_v end asc  nulls last,
    case when not v_asc then s.sort_v end desc nulls last,
    case when v_asc then s.id end asc,
    case when not v_asc then s.id end desc
  limit v_limit;
end $$;
