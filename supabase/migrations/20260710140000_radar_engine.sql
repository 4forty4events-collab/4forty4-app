-- 4Forty4 Radar — Layers 2 & 3: state tracking + the continuous matching pipeline.
-- Reuses the existing notification stack (queue_notification -> notifications ->
-- deliver-push), so queuing a Radar alert here IS the whole delivery path.

-- ── Preference + type plumbing ──────────────────────────────────────────────
-- Radar gets its own opt-out, defaulting on (the shipped UI keeps the feature
-- flag-locked regardless; this governs delivery once it unlocks).
alter table public.user_settings
  add column if not exists notify_radar boolean not null default true;

-- Allow the new notification type through the ledger's CHECK.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('event_reminder', 'nearby_alert', 'recommendation', 'organizer_update', 'radar_alert'));

-- Teach the queue primitive the radar preference mapping (otherwise 'radar_alert'
-- would fall through to the always-on default and ignore the toggle).
create or replace function public.queue_notification(
  p_user uuid, p_type text, p_title text, p_body text,
  p_venue uuid default null, p_event uuid default null,
  p_route text default null, p_payload jsonb default null, p_market text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pref boolean;
  v_id uuid;
begin
  select case p_type
    when 'event_reminder'   then notify_event_reminders
    when 'nearby_alert'     then notify_nearby
    when 'recommendation'   then notify_recommendations
    when 'organizer_update' then notify_organizer_updates
    when 'radar_alert'      then notify_radar
    else true
  end into v_pref
  from public.user_settings where user_id = p_user;

  if v_pref is distinct from true then return null; end if;  -- opted out / no settings

  insert into public.notifications (user_id, type, title, body, venue_id, event_id, route, payload, market)
  values (p_user, p_type, p_title, p_body, p_venue, p_event, p_route, p_payload, p_market)
  returning id into v_id;
  return v_id;
end $$;

-- ── Layer 2: state tracking ─────────────────────────────────────────────────
-- Last-known ping per user (one row, upserted). location is written by the RPC.
create table if not exists public.user_radar_positions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  location   geography(Point, 4326),
  updated_at timestamptz not null default now()
);
alter table public.user_radar_positions enable row level security;
drop policy if exists "own radar position" on public.user_radar_positions;
create policy "own radar position" on public.user_radar_positions
  for select using (auth.uid() = user_id);

-- Dedupe ledger: who was alerted for what, and when. The unique (user, kind, target)
-- key + a cooldown check is what stops a user being re-spammed for the same place.
create table if not exists public.radar_alert_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  target_kind     text not null check (target_kind in ('venue', 'event')),
  target_id       uuid not null,
  market          text,
  distance_m      double precision,
  notification_id uuid,
  alerted_at      timestamptz not null default now()
);
create unique index if not exists radar_ledger_target_uidx
  on public.radar_alert_ledger (user_id, target_kind, target_id);
create index if not exists radar_ledger_recent_idx
  on public.radar_alert_ledger (user_id, alerted_at desc);
alter table public.radar_alert_ledger enable row level security;
drop policy if exists "own radar ledger" on public.radar_alert_ledger;
create policy "own radar ledger" on public.radar_alert_ledger
  for select using (auth.uid() = user_id);
-- No INSERT/UPDATE policies: only the SECURITY DEFINER RPC writes these.

-- ── Layer 3: continuous matching pipeline ───────────────────────────────────
-- Records the ping, finds eligible venues (radius) + time-gated events (wider
-- radius) via the PostGIS index, drops anything alerted within the cooldown,
-- queues a preference-gated notification per fresh hit (which deliver-push then
-- sends), stamps the ledger, and returns the alert payloads.
--
-- A logged-in caller may only evaluate THEMSELVES; the service role (auth.uid()
-- null — the edge/scheduler path) may evaluate anyone.
create or replace function public.evaluate_radar_proximity(
  p_user_id        uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       double precision default 500,
  p_event_radius_m double precision default 1500,
  p_cooldown       interval default interval '24 hours',
  p_limit          integer default 8
)
returns table (
  kind text, target_id uuid, name text, category text,
  distance_m double precision, lat double precision, lng double precision,
  starts_at timestamptz, market text,
  alert_title text, alert_body text, notification_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_point geography;
  r record;
  v_notif uuid;
  v_title text;
  v_body  text;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Radar: cannot evaluate another user.';
  end if;
  if p_lat is null or p_lng is null then return; end if;

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- Record the ping (last-known position).
  insert into public.user_radar_positions (user_id, lat, lng, location, updated_at)
  values (p_user_id, p_lat, p_lng, v_point, now())
  on conflict (user_id) do update
    set lat = excluded.lat, lng = excluded.lng, location = excluded.location, updated_at = now();

  for r in
    with hits as (
      select 'venue'::text as k, v.id as tid, v.name as ttl, v.category as cat,
             st_distance(v.location, v_point) as dist,
             v.latitude as la, v.longitude as lo, null::timestamptz as starts, v.market as mkt
      from public.venues v
      where v.is_radar_eligible
        and v.location is not null
        and st_dwithin(v.location, v_point, p_radius_m)
      union all
      select 'event'::text, e.id, e.title, e.category,
             st_distance(ev.location, v_point),
             ev.latitude, ev.longitude, e.start_time, e.market
      from public.events e
      join public.venues ev on ev.id = e.venue_id
      where ev.location is not null
        and st_dwithin(ev.location, v_point, p_event_radius_m)
        and public.event_in_radar_window(e.start_time, e.end_time)
    )
    select h.k, h.tid, h.ttl, h.cat, h.dist, h.la, h.lo, h.starts, h.mkt
    from hits h
    where not exists (
      select 1 from public.radar_alert_ledger l
      where l.user_id = p_user_id
        and l.target_kind = h.k
        and l.target_id = h.tid
        and l.alerted_at > now() - p_cooldown
    )
    order by h.dist asc
    limit greatest(coalesce(p_limit, 8), 1)
  loop
    if r.k = 'event' then
      v_title := '👑 Radar: ' || r.ttl;
      v_body  := 'A major event is happening right by you — tap to see it.';
    else
      v_title := '👑 Radar: ' || r.ttl || ' is near';
      v_body  := 'A premium spot is ' || round(r.dist)::int::text || 'm away — go check it out.';
    end if;

    -- Queue the (preference-gated) notification; deliver-push sends it. Null id
    -- means the user opted radar off — we still log so the cooldown holds.
    v_notif := public.queue_notification(
      p_user_id, 'radar_alert', v_title, v_body,
      case when r.k = 'venue' then r.tid end,
      case when r.k = 'event' then r.tid end,
      'ListingDetail',
      jsonb_build_object('kind', r.k, 'source', 'radar', 'distance_m', round(r.dist)::int),
      r.mkt
    );

    -- Refresh this target's ledger row. delete+insert (not ON CONFLICT) because the
    -- arbiter list's bare `target_id` would collide with this function's OUT param;
    -- the aliased delete keeps every column reference qualified and unambiguous.
    delete from public.radar_alert_ledger as l
      where l.user_id = p_user_id and l.target_kind = r.k and l.target_id = r.tid;
    insert into public.radar_alert_ledger (user_id, target_kind, target_id, market, distance_m, notification_id, alerted_at)
    values (p_user_id, r.k, r.tid, r.mkt, r.dist, v_notif, now());

    kind := r.k; target_id := r.tid; name := r.ttl; category := r.cat;
    distance_m := r.dist; lat := r.la; lng := r.lo; starts_at := r.starts; market := r.mkt;
    alert_title := v_title; alert_body := v_body; notification_id := v_notif;
    return next;
  end loop;
end $$;

grant execute on function public.evaluate_radar_proximity(uuid, double precision, double precision, double precision, double precision, interval, integer) to authenticated;
