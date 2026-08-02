-- Stage 5A — Experience posts: the Explorer Network's core content model.
--
-- Purday's feed answers "what's happening around me RIGHT NOW", so a post is no
-- longer one undifferentiated "moment". It declares WHEN it happened relative to the
-- experience, and — for the one claim that matters — whether the app could actually
-- verify it:
--
--   on_the_way    travelling toward a place        (self-declared)
--   live          physically there right now       (GPS-VERIFIED or downgraded)
--   just_finished shortly after leaving            (self-declared)
--   memory        shared later                     (self-declared, the default)
--   blueprint     a reusable itinerary, not a visit
--
-- The integrity rule: a client can never mark its own post verified. `verification`
-- is forced to 'unverified' by a trigger on every ordinary write; only
-- create_experience_post() — which recomputes proximity server-side from coordinates
-- it does NOT store — may set it. A 'live' claim that fails the proximity check is
-- stored honestly as a 'memory' rather than a lie.
--
-- Privacy: raw coordinates are never persisted. We keep only the derived verdict and
-- a friendly public label ("Skyline Rooftop" / "Algiers").
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` (migration history desynced).
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1) COLUMNS
-- ============================================================================
alter table public.posts add column if not exists experience_type text not null default 'memory';
alter table public.posts drop constraint if exists posts_experience_type_check;
alter table public.posts add constraint posts_experience_type_check
  check (experience_type in ('on_the_way', 'live', 'just_finished', 'memory', 'blueprint'));

alter table public.posts add column if not exists verification text not null default 'unverified';
alter table public.posts drop constraint if exists posts_verification_check;
alter table public.posts add constraint posts_verification_check
  check (verification in ('verified', 'unverified'));

alter table public.posts add column if not exists verified_at timestamptz;
-- Public, friendly place name. Deliberately NOT coordinates — the app knows where the
-- user was, the feed only ever shows a venue or area name.
alter table public.posts add column if not exists place_label text;
-- Blueprint posts point at the shared itinerary instead of carrying photos.
alter table public.posts add column if not exists trip_id uuid references public.collaborative_trips(id) on delete set null;

-- The Live Pulse and the liveness-first ranker both scan only the "happening now"
-- slice, so it gets its own partial index.
create index if not exists posts_live_idx on public.posts (market, created_at desc)
  where status = 'published' and experience_type in ('live', 'on_the_way');

-- ============================================================================
-- 2) VERIFICATION GUARD — clients cannot self-certify.
--    create_experience_post() flips a transaction-local setting to opt its single
--    write out of the guard; every other write is constrained:
--
--      INSERT — forced to 'unverified'. Earning the badge requires the RPC.
--      UPDATE — the whole verified claim is FROZEN: the verdict, and everything the
--               verdict is ABOUT.
--
--    Freezing on update matters three times over.
--
--    1. The rollup triggers (like_count, comment_count, view_count, dwell) all UPDATE
--       posts. Stripping verification there would quietly un-verify a post the moment
--       somebody liked it.
--    2. Without freezing experience_type, "posts self update" would let anyone insert
--       a memory and then edit it into a LIVE NOW badge.
--    3. Freezing the verdict is not enough on its own — the SUBJECT has to be frozen
--       too. Otherwise: post a genuine verified Live from the café you're actually in,
--       then `update posts set venue_id = '<some rooftop>'`. Verification survives (by
--       rule 1), and the card now reads "Verified at Skyline Rooftop". Freezing
--       venue_id / event_id / place_label closes that, and costs nothing: re-tagging a
--       post's place is not a feature the app offers.
--
--    A verified post is therefore immutable in every field that constitutes the claim.
--    Editing the caption still works.
-- ============================================================================
create or replace function public.posts_guard_verification() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('purday.verified_write', true), '') = 'on' then
    return new;   -- the trusted RPC path
  end if;
  if tg_op = 'UPDATE' then
    new.verification    := old.verification;
    new.verified_at     := old.verified_at;
    new.experience_type := old.experience_type;
    -- The subject of the claim, not just the verdict.
    new.venue_id        := old.venue_id;
    new.event_id        := old.event_id;
    new.place_label     := old.place_label;
  else
    new.verification := 'unverified';
    new.verified_at  := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_posts_guard_verification on public.posts;
create trigger trg_posts_guard_verification before insert or update on public.posts
  for each row execute function public.posts_guard_verification();

-- ============================================================================
-- 3) CREATE — the only path that may produce a verified post.
--    p_lat/p_lng are consumed to compute a distance and then discarded.
-- ============================================================================
-- Dropped first: CREATE OR REPLACE cannot change a function's return type, so a re-run
-- after an earlier revision of this file would otherwise fail.
drop function if exists public.create_experience_post(text, text, text[], uuid, uuid, text, double precision, double precision, uuid);
create function public.create_experience_post(
  p_type       text,
  p_body       text default null,
  p_photo_urls text[] default '{}',
  p_venue      uuid default null,
  p_event      uuid default null,
  p_market     text default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_trip       uuid default null
) returns jsonb   -- { id, experience_type, verification } — the caller is told the VERDICT,
                  -- so the composer can say "stored as a memory" instead of silently
                  -- downgrading a live claim behind the user's back.
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_type     text := p_type;
  v_target   geography;
  v_label    text;
  v_city     text;
  v_verified boolean := false;
  v_trip     uuid := null;
  v_id       uuid;
  c_radius_m constant integer := 250;   -- "at the venue", generous enough for big sites
begin
  if v_user is null then raise exception 'auth required'; end if;
  if v_type is null or v_type not in ('on_the_way', 'live', 'just_finished', 'memory', 'blueprint') then
    v_type := 'memory';
  end if;

  -- Resolve the public label and the point we verify against. Events borrow their
  -- venue's location, since an event row carries no geometry of its own.
  if p_venue is not null then
    select v.name, v.city, v.location into v_label, v_city, v_target
      from public.venues v where v.id = p_venue;
  elsif p_event is not null then
    select e.title, v.city, v.location into v_label, v_city, v_target
      from public.events e left join public.venues v on v.id = e.venue_id
     where e.id = p_event;
  end if;

  -- LIVE is the only claim we can check. It needs a real place, a real point, and the
  -- user standing within c_radius_m of it. Anything else is not a lesser "live" — it
  -- is simply a memory, and is stored as one.
  if v_type = 'live' then
    if p_lat is not null and p_lng is not null and v_target is not null then
      v_verified := st_dwithin(st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, v_target, c_radius_m);
    end if;
    if not v_verified then v_type := 'memory'; end if;
  end if;

  -- A blueprint post may only point at a trip the caller can actually see.
  if p_trip is not null then
    select t.id into v_trip from public.collaborative_trips t
     where t.id = p_trip
       and (t.is_public or exists (select 1 from public.trip_participants tp
                                    where tp.trip_id = t.id and tp.user_id = v_user));
  end if;

  if v_verified then perform set_config('purday.verified_write', 'on', true); end if;

  insert into public.posts (
    user_id, body, photo_urls, venue_id, event_id, market,
    experience_type, verification, verified_at, place_label, trip_id
  ) values (
    v_user,
    nullif(btrim(coalesce(p_body, '')), ''),
    coalesce(p_photo_urls, '{}'),
    p_venue, p_event, p_market,
    v_type,
    case when v_verified then 'verified' else 'unverified' end,
    case when v_verified then now() end,
    coalesce(v_label, v_city),
    v_trip
  ) returning id into v_id;

  perform set_config('purday.verified_write', 'off', true);
  return jsonb_build_object(
    'id', v_id,
    'experience_type', v_type,
    'verification', case when v_verified then 'verified' else 'unverified' end
  );
end $$;

grant execute on function public.create_experience_post(text, text, text[], uuid, uuid, text, double precision, double precision, uuid) to authenticated;

-- ============================================================================
-- 4) LIVE PULSE — the city's heartbeat: what is happening right now, by category.
--    Counts only the "happening now" types inside a time window, optionally within
--    p_radius_m of the viewer. Returns per-category counts; the client sums them.
-- ============================================================================
create or replace function public.live_pulse(
  p_market      text default null,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_radius_m    integer default 25000,
  p_window_mins integer default 180
) returns table (category text, n integer)
language sql stable security definer set search_path = public as $$
  with pt as (
    select case when p_lat is not null and p_lng is not null
                then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as g
  )
  select coalesce(v.category, e.category, 'other')::text, count(*)::int
    from public.posts p
    left join public.venues v on v.id = p.venue_id
    left join public.events e on e.id = p.event_id
    -- An event carries no geometry of its own, so it borrows its venue's. Without this
    -- join every event-tagged post has a null location and skips the radius test
    -- entirely — a concert in Tipaza would count toward an Algiers pulse.
    left join public.venues ev on ev.id = e.venue_id
    cross join pt
   where p.status = 'published'
     and p.experience_type in ('live', 'on_the_way')
     and p.created_at >= now() - make_interval(mins => greatest(1, p_window_mins))
     and (p_market is null or p.market = p_market or p.market is null)
     -- Radius applies only when we have BOTH a viewer point and a located place. A post
     -- with no locatable place still counts toward the city's pulse.
     and (
       pt.g is null
       or coalesce(v.location, ev.location) is null
       or st_dwithin(coalesce(v.location, ev.location), pt.g, p_radius_m)
     )
   group by 1
   order by 2 desc;
$$;

grant execute on function public.live_pulse(text, double precision, double precision, integer, integer) to anon, authenticated;
