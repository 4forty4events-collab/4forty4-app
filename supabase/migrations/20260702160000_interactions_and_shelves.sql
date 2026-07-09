-- Discovery Slice 4: interaction capture (the fuel for future personalization),
-- an editorial "featured" flag, and a date-range extension to discover() for
-- time-based shelves (Weekend Ideas). Recently-Viewed reads from interactions.

-- 1) interactions: view / save / plan_add, per signed-in user. Same two-nullable
-- -FK shape as saved_items/budget_items (exactly one of venue_id/event_id set).
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  type text not null check (type in ('view', 'save', 'plan_add')),
  market text,
  created_at timestamptz not null default now()
);
create index if not exists idx_interactions_user_recent on public.interactions (user_id, type, created_at desc);
create index if not exists idx_interactions_venue on public.interactions (venue_id);
create index if not exists idx_interactions_event on public.interactions (event_id);

alter table public.interactions enable row level security;
drop policy if exists "own interactions" on public.interactions;
create policy "own interactions" on public.interactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Editorial featured flag + a seed so Editor's Picks populates immediately.
alter table public.venues add column if not exists is_featured boolean not null default false;
alter table public.events add column if not exists is_featured boolean not null default false;
create index if not exists idx_venues_featured on public.venues (market) where is_featured;

update public.venues set is_featured = true
where id in (
  select id from public.venues
  where market = 'DZ' and rating is not null and is_stub = false
  order by rating * ln(coalesce(review_count, 0) + 1) desc
  limit 8
);

create or replace function public.set_venue_featured(p_id uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.'; end if;
  update public.venues set is_featured = coalesce(p_featured, false) where id = p_id;
end $$;

-- 3) Extend discover() with p_starts_before (event date ceiling — for Weekend/
-- "this week" shelves) and p_featured (Editor's Picks). Drop the old signature
-- first so PostgREST never sees two overloads.
drop function if exists public.discover(text, text[], text, double precision, double precision, double precision, text[], text, jsonb, integer);

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
  p_limit integer default 20,
  p_starts_before timestamptz default null,
  p_featured boolean default false
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
      and (not p_featured or v.is_featured)
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
      and (p_starts_before is null or e.start_time <= p_starts_before)
      and (not p_featured or e.is_featured)
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

grant execute on function public.discover(text, text[], text, double precision, double precision, double precision, text[], text, jsonb, integer, timestamptz, boolean) to anon, authenticated;
