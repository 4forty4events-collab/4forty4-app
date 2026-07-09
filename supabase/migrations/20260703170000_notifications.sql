-- Notifications Engine — data layer. An in-app ledger + preference-gated queue
-- primitives + context generators. Design principle (no-spam): generators are
-- SYSTEM-invoked (scheduled / deliberate), never auto-triggered on every venue
-- insert, and every queue respects the user's user_settings toggle.

-- ============================================================================
-- 1) LEDGER
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('event_reminder', 'nearby_alert', 'recommendation', 'organizer_update')),
  title text not null,
  body text,
  -- deep-link routing: typed target (FK -> cascades if the venue/event is deleted)
  -- plus a generic route+payload for anything without a direct target.
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  route text,
  payload jsonb,
  read_at timestamptz,               -- null = unread
  market text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_feed on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notifications read own" on public.notifications;
drop policy if exists "notifications update own" on public.notifications;
drop policy if exists "notifications delete own" on public.notifications;
-- No INSERT policy: clients never write notifications; the SECURITY DEFINER
-- generators below (running as owner) do. Users may read/mark/delete their own.
create policy "notifications read own"   on public.notifications for select using (auth.uid() = user_id);
create policy "notifications update own" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications delete own" on public.notifications for delete using (auth.uid() = user_id);

-- ============================================================================
-- 2) QUEUE PRIMITIVE + CONTEXT GENERATORS (system-only; preference-gated)
-- ============================================================================

-- The core primitive: queue ONE notification for a user, but only if their
-- user_settings toggle for that type is on. Returns the id, or null if opted out.
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
    else true
  end into v_pref
  from public.user_settings where user_id = p_user;

  if v_pref is distinct from true then return null; end if;  -- opted out / no settings

  insert into public.notifications (user_id, type, title, body, venue_id, event_id, route, payload, market)
  values (p_user, p_type, p_title, p_body, p_venue, p_event, p_route, p_payload, p_market)
  returning id into v_id;
  return v_id;
end $$;

-- Nearby alert: a fresh venue matched to a MARKET (server has no user coords, so
-- "nearby" = same market). Set-based fanout, inline preference gate. INVOKE
-- DELIBERATELY (e.g. for a curated/featured venue) — NOT a per-insert trigger, so
-- a bulk harvest never spams. Returns the number of users notified.
create or replace function public.notify_new_venue(p_venue uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_market text; v_count integer;
begin
  select name, market into v_name, v_market from public.venues where id = p_venue and is_stub = false;
  if v_name is null then return 0; end if;

  insert into public.notifications (user_id, type, title, body, venue_id, route, payload, market)
  select p.id, 'nearby_alert', 'New in your area: ' || v_name,
         'A new place just landed near you.', p_venue, 'ListingDetail',
         jsonb_build_object('kind', 'venue'), v_market
  from public.profiles p
  join public.user_settings s on s.user_id = p.id
  where p.market = v_market and s.notify_nearby = true;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Event reminders: for events starting within p_within that a user SAVED, has
-- reminders on, and hasn't already been reminded about. Dedup via NOT EXISTS.
-- Meant to run on a schedule. Returns the number of reminders queued.
create or replace function public.enqueue_event_reminders(p_within interval default interval '24 hours')
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.notifications (user_id, type, title, body, event_id, route, payload, market)
  select s.user_id, 'event_reminder', 'Reminder: ' || e.title,
         'Happening soon — don''t miss it.', e.id, 'ListingDetail',
         jsonb_build_object('kind', 'event'), e.market
  from public.saved_items s
  join public.events e on e.id = s.event_id
  join public.user_settings us on us.user_id = s.user_id
  where s.event_id is not null
    and us.notify_event_reminders = true
    and e.start_time between now() and now() + p_within
    and not exists (
      select 1 from public.notifications n
      where n.user_id = s.user_id and n.event_id = e.id and n.type = 'event_reminder'
    );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Lock the generators to the backend (scheduled jobs / service role / admin).
-- Regular clients must never queue notifications for other users.
revoke execute on function public.queue_notification(uuid, text, text, text, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.notify_new_venue(uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_event_reminders(interval) from public, anon, authenticated;

-- ============================================================================
-- 3) USER-FACING LIST (unread-first ordering + offset paging, own rows only)
-- ============================================================================
create or replace function public.list_notifications(p_limit integer default 20, p_offset integer default 0)
returns setof public.notifications
language sql stable security definer set search_path = public as $$
  select * from public.notifications
  where user_id = auth.uid()
  order by (read_at is null) desc, created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;
grant execute on function public.list_notifications(integer, integer) to authenticated;
