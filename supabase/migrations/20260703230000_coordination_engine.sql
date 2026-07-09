-- Coordination Engine — data layer. Community place requests, collaborative group
-- trips (rooms + roster + itinerary + chat), lifecycle notification types, and
-- active-event indexing. Trip RLS uses SECURITY DEFINER helpers to avoid the
-- classic trip_participants self-reference recursion.

-- ============================================================================
-- 1) COMMUNITY PLACE REQUESTS
-- ============================================================================
create table if not exists public.venue_requests (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  suggested_category text,
  coordinates geography(point, 4326),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  market text,
  created_at timestamptz not null default now()
);
create index if not exists idx_venue_requests_submitter on public.venue_requests (submitted_by, created_at desc);
create index if not exists idx_venue_requests_status on public.venue_requests (status, created_at desc);
create index if not exists idx_venue_requests_geo on public.venue_requests using gist (coordinates);

alter table public.venue_requests enable row level security;
drop policy if exists "venue_requests read own or admin" on public.venue_requests;
drop policy if exists "venue_requests insert own" on public.venue_requests;
drop policy if exists "venue_requests admin update" on public.venue_requests;
create policy "venue_requests read own or admin" on public.venue_requests for select using (auth.uid() = submitted_by or public.is_admin());
create policy "venue_requests insert own"        on public.venue_requests for insert with check (auth.uid() = submitted_by);
create policy "venue_requests admin update"      on public.venue_requests for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.review_venue_request(p_id uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'Bad status.'; end if;
  update public.venue_requests
  set status = p_status, admin_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;
end $$;
grant execute on function public.review_venue_request(uuid, text, text) to authenticated;

-- ============================================================================
-- 2) COLLABORATIVE TRIPS — trip + roster + itinerary + chat
-- ============================================================================
create table if not exists public.collaborative_trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  market text,
  start_date date,
  end_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.collaborative_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index if not exists idx_trip_participants_user on public.trip_participants (user_id);
create index if not exists idx_trip_participants_trip on public.trip_participants (trip_id);

create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.collaborative_trips(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  day_date date,
  sort_order integer not null default 0,
  note text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trip_items_one_target check (num_nonnulls(venue_id, event_id) = 1)
);
create index if not exists idx_trip_items_trip on public.trip_items (trip_id, day_date, sort_order);

create table if not exists public.trip_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.collaborative_trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- null for AI / system
  body text,
  is_ai_response boolean not null default false,
  payload jsonb,                                                -- rich deep-linked venue recs
  created_at timestamptz not null default now()
);
create index if not exists idx_trip_messages_trip on public.trip_messages (trip_id, created_at desc);

-- SECURITY DEFINER membership helpers — used inside the trip policies so they do
-- NOT re-trigger RLS on trip_participants (which would recurse).
create or replace function public.is_trip_participant(p_trip uuid, p_user uuid default auth.uid())
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.trip_participants where trip_id = p_trip and user_id = p_user);
$$;
create or replace function public.trip_role(p_trip uuid, p_user uuid default auth.uid())
returns text language sql security definer stable set search_path = public as $$
  select role from public.trip_participants where trip_id = p_trip and user_id = p_user;
$$;
create or replace function public.is_trip_editor(p_trip uuid, p_user uuid default auth.uid())
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.trip_participants where trip_id = p_trip and user_id = p_user and role in ('owner', 'editor'));
$$;

alter table public.collaborative_trips enable row level security;
alter table public.trip_participants enable row level security;
alter table public.trip_items enable row level security;
alter table public.trip_messages enable row level security;

-- Trips: participants read; editors update; owner deletes. (Creation is via RPC.)
drop policy if exists "trips read participant" on public.collaborative_trips;
drop policy if exists "trips update editor" on public.collaborative_trips;
drop policy if exists "trips delete owner" on public.collaborative_trips;
create policy "trips read participant" on public.collaborative_trips for select using (public.is_trip_participant(id));
create policy "trips update editor"    on public.collaborative_trips for update using (public.is_trip_editor(id)) with check (public.is_trip_editor(id));
create policy "trips delete owner"     on public.collaborative_trips for delete using (public.trip_role(id) = 'owner');

-- Roster: participants see the roster; owner changes roles / removes; anyone can
-- remove themselves (leave). Adds happen via RPC.
drop policy if exists "participants read" on public.trip_participants;
drop policy if exists "participants owner update" on public.trip_participants;
drop policy if exists "participants owner or self delete" on public.trip_participants;
create policy "participants read"               on public.trip_participants for select using (public.is_trip_participant(trip_id));
create policy "participants owner update"       on public.trip_participants for update using (public.trip_role(trip_id) = 'owner') with check (public.trip_role(trip_id) = 'owner');
create policy "participants owner or self delete" on public.trip_participants for delete using (public.trip_role(trip_id) = 'owner' or user_id = auth.uid());

-- Itinerary items: participants read; editors write.
drop policy if exists "trip_items read" on public.trip_items;
drop policy if exists "trip_items editor write" on public.trip_items;
create policy "trip_items read"         on public.trip_items for select using (public.is_trip_participant(trip_id));
create policy "trip_items editor write" on public.trip_items for all using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id));

-- Messages: participants read; participants post their OWN, non-AI messages.
-- (AI/system messages are written by the backend via service role.)
drop policy if exists "trip_messages read" on public.trip_messages;
drop policy if exists "trip_messages insert own" on public.trip_messages;
drop policy if exists "trip_messages delete own" on public.trip_messages;
create policy "trip_messages read"       on public.trip_messages for select using (public.is_trip_participant(trip_id));
create policy "trip_messages insert own" on public.trip_messages for insert with check (public.is_trip_participant(trip_id) and user_id = auth.uid() and is_ai_response = false);
create policy "trip_messages delete own" on public.trip_messages for delete using (user_id = auth.uid());

-- Create a trip + seat the creator as owner, atomically.
create or replace function public.create_group_trip(p_title text, p_market text default null, p_start date default null, p_end date default null)
returns public.collaborative_trips language plpgsql security definer set search_path = public as $$
declare v_trip public.collaborative_trips;
begin
  insert into public.collaborative_trips (title, market, start_date, end_date, created_by)
  values (p_title, p_market, p_start, p_end, auth.uid())
  returning * into v_trip;
  insert into public.trip_participants (trip_id, user_id, role) values (v_trip.id, auth.uid(), 'owner');
  return v_trip;
end $$;
grant execute on function public.create_group_trip(text, text, date, date) to authenticated;

-- Add/invite a participant (owner/editor only), upsert role.
create or replace function public.add_trip_participant(p_trip uuid, p_user uuid, p_role text default 'viewer')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_editor(p_trip, auth.uid()) then raise exception 'Not allowed.'; end if;
  if p_role not in ('owner', 'editor', 'viewer') then raise exception 'Bad role.'; end if;
  insert into public.trip_participants (trip_id, user_id, role)
  values (p_trip, p_user, p_role)
  on conflict (trip_id, user_id) do update set role = excluded.role;
end $$;
grant execute on function public.add_trip_participant(uuid, uuid, text) to authenticated;

-- ============================================================================
-- 3) LIFECYCLE NOTIFIERS + ACTIVE-EVENT INDEXING
-- ============================================================================
-- High-performance NOW() active filtering on the event end boundary (end_time is
-- this schema's "end_date").
create index if not exists idx_events_end_time on public.events (end_time);

-- Accommodate the new structural notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('event_reminder', 'nearby_alert', 'recommendation', 'organizer_update',
                  'registration_closing', 'date_approaching', 'feedback_prompt'));

-- Route the new types through the existing event-reminder preference toggle.
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
    when 'event_reminder'       then notify_event_reminders
    when 'registration_closing' then notify_event_reminders
    when 'date_approaching'     then notify_event_reminders
    when 'feedback_prompt'      then notify_event_reminders
    when 'nearby_alert'         then notify_nearby
    when 'recommendation'       then notify_recommendations
    when 'organizer_update'     then notify_organizer_updates
    else true
  end into v_pref
  from public.user_settings where user_id = p_user;

  if v_pref is distinct from true then return null; end if;

  insert into public.notifications (user_id, type, title, body, venue_id, event_id, route, payload, market)
  values (p_user, p_type, p_title, p_body, p_venue, p_event, p_route, p_payload, p_market)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.queue_notification(uuid, text, text, text, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
