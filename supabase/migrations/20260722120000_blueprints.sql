-- Blueprints (redesign stage 2): a public outing others can clone, rate, and browse.
-- Builds on the existing public-trip + clone_trip infra: a "blueprint" is just a
-- public collaborative_trip, now with star ratings + a clone counter + a browse RPC.
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` (history desynced). Idempotent.

-- 1) Rollups on the trip (trigger-maintained for ratings; RPC-bumped for clones).
alter table public.collaborative_trips add column if not exists rating_avg   numeric(3,2) not null default 0;
alter table public.collaborative_trips add column if not exists rating_count int          not null default 0;
alter table public.collaborative_trips add column if not exists clone_count  int          not null default 0;

-- 2) One star rating per (trip, user). Readable by any signed-in user (public
--    discovery); you write only your own.
create table if not exists public.trip_ratings (
  trip_id    uuid not null references public.collaborative_trips(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
alter table public.trip_ratings enable row level security;
drop policy if exists "trip_ratings readable" on public.trip_ratings;
create policy "trip_ratings readable" on public.trip_ratings for select using (auth.uid() is not null);
drop policy if exists "trip_ratings self insert" on public.trip_ratings;
create policy "trip_ratings self insert" on public.trip_ratings for insert with check (auth.uid() = user_id);
drop policy if exists "trip_ratings self update" on public.trip_ratings;
create policy "trip_ratings self update" on public.trip_ratings for update using (auth.uid() = user_id);
drop policy if exists "trip_ratings self delete" on public.trip_ratings;
create policy "trip_ratings self delete" on public.trip_ratings for delete using (auth.uid() = user_id);

create or replace function public.recompute_trip_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_trip uuid := coalesce(new.trip_id, old.trip_id);
begin
  update public.collaborative_trips t set
    rating_count = (select count(*) from public.trip_ratings r where r.trip_id = v_trip),
    rating_avg   = coalesce((select round(avg(stars)::numeric, 2) from public.trip_ratings r where r.trip_id = v_trip), 0)
  where t.id = v_trip;
  return null;
end $$;
drop trigger if exists trg_recompute_trip_rating on public.trip_ratings;
create trigger trg_recompute_trip_rating after insert or update or delete on public.trip_ratings
  for each row execute function public.recompute_trip_rating();

-- 3) Rate a blueprint (upsert own star; only on public trips). SECURITY DEFINER so
--    it can write regardless of the caller's row visibility.
create or replace function public.rate_blueprint(p_trip uuid, p_stars int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_stars < 1 or p_stars > 5 then raise exception 'stars must be 1..5'; end if;
  if not exists (select 1 from public.collaborative_trips where id = p_trip and is_public) then
    raise exception 'not a public blueprint';
  end if;
  insert into public.trip_ratings (trip_id, user_id, stars)
  values (p_trip, auth.uid(), p_stars)
  on conflict (trip_id, user_id) do update set stars = excluded.stars, created_at = now();
end $$;
grant execute on function public.rate_blueprint(uuid, int) to authenticated;

-- 4) Count a clone against the source blueprint (called after clone_trip).
create or replace function public.bump_blueprint_clone(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.collaborative_trips set clone_count = coalesce(clone_count, 0) + 1
  where id = p_trip and is_public;
end $$;
grant execute on function public.bump_blueprint_clone(uuid) to authenticated;

-- 5) The browse gallery: public trips + rollups + first-stop cover + creator, ranked
--    by rating then recency. SECURITY DEFINER so non-members can discover them.
create or replace function public.list_blueprints(p_market text default null, p_limit int default 30)
returns table (
  id uuid, title text, market text, start_date date, end_date date, created_by uuid, created_at timestamptz,
  item_count int, rating_avg numeric, rating_count int, clone_count int,
  cover_url text, creator_name text, creator_avatar text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.market, t.start_date, t.end_date, t.created_by, t.created_at,
    coalesce((select count(*) from public.trip_items ti where ti.trip_id = t.id), 0)::int as item_count,
    coalesce(t.rating_avg, 0) as rating_avg,
    coalesce(t.rating_count, 0) as rating_count,
    coalesce(t.clone_count, 0) as clone_count,
    (select coalesce(v.cover_image_url, e.cover_image_url)
       from public.trip_items ti
       left join public.venues v on v.id = ti.venue_id
       left join public.events e on e.id = ti.event_id
       where ti.trip_id = t.id
       order by ti.day_date nulls last, ti.sort_order
       limit 1) as cover_url,
    pp.full_name  as creator_name,
    pp.avatar_url as creator_avatar
  from public.collaborative_trips t
  left join public.public_profiles pp on pp.id = t.created_by
  where t.is_public = true
    and (p_market is null or t.market = p_market or t.market is null)
  order by coalesce(t.rating_avg, 0) desc, t.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.list_blueprints(text, int) to anon, authenticated;
