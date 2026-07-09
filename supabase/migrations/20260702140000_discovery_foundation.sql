-- Discovery Engine — Slice 1 foundation.
-- Server-side unified discovery: geo (PostGIS), fuzzy accent-insensitive text
-- (pg_trgm + unaccent), and ONE `discover` RPC that UNIONs venues + upcoming
-- events into a single ranked, filtered, keyset-paginated feed. All discovery
-- capabilities (feed, nearby, search, trending, collections) are this RPC with a
-- different DiscoveryQuery — no client-side merge, no whole-table fetches.

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Immutable accent-stripper so it can be used in expression indexes (raw
-- unaccent() is only STABLE). search_path spans public+extensions so it resolves
-- regardless of which schema the extensions installed into.
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, extensions
as $$ select unaccent($1) $$;

-- Geo column maintained from lat/lng by a trigger (correct no matter which insert
-- path a venue arrives through: harvest, publish, manual).
alter table public.venues add column if not exists location geography(Point, 4326);

update public.venues
set location = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where latitude is not null and longitude is not null and location is null;

create or replace function public.set_venue_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.location := case
    when new.latitude is not null and new.longitude is not null
      then st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography
    else null
  end;
  return new;
end $$;

drop trigger if exists trg_set_venue_location on public.venues;
create trigger trg_set_venue_location
  before insert or update of latitude, longitude on public.venues
  for each row execute function public.set_venue_location();

-- Indexes: geo (GiST), filter (market+category), fuzzy text (trigram GIN).
create index if not exists idx_venues_location   on public.venues using gist (location);
create index if not exists idx_venues_market_cat  on public.venues (market, category);
create index if not exists idx_venues_name_trgm    on public.venues using gin (public.f_unaccent(lower(name)) gin_trgm_ops);
create index if not exists idx_venues_desc_trgm    on public.venues using gin (public.f_unaccent(lower(coalesce(description, ''))) gin_trgm_ops);
create index if not exists idx_events_market_start on public.events (market, start_time);
create index if not exists idx_events_title_trgm   on public.events using gin (public.f_unaccent(lower(title)) gin_trgm_ops);

-- ============================================================================
-- discover(): the unified discovery pipeline.
--   Filters : market (required), categories[], text (fuzzy), near(lat/lng/radius),
--             kinds[] ('venue'/'event').
--   Sort    : 'recent' | 'distance' | 'rating' | 'trending' | 'relevance'.
--   Paging  : keyset via p_cursor {"v": <sort value>, "id": <uuid>} + p_limit.
--   Returns : (kind, item jsonb [the full row, normalized client-side], distance_m,
--             sort_v, out_id) — echo {sort_v,out_id} as the next cursor.
-- Events inherit their venue's geo; upcoming-only (start_time >= now).
-- ============================================================================
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
      when 'distance'  then coalesce(c.dist, 1e12)
      when 'rating'    then coalesce(c.rating, -1)
      when 'trending'  then coalesce(c.rating, 0) * ln(coalesce(c.review_count, 0) + 1)
      when 'relevance' then coalesce(c.sim, 0)
      else extract(epoch from c.created_at)
    end as sort_v
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

grant execute on function public.discover(text, text[], text, double precision, double precision, double precision, text[], text, jsonb, integer) to anon, authenticated;
