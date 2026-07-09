-- Public plan publishing + Community Blueprints. A trip can be published
-- (is_public) so anyone can discover, preview its itinerary, and clone it into a
-- fresh personal trip. Chat stays private (trip_messages unchanged).

alter table public.collaborative_trips add column if not exists is_public boolean not null default false;
create index if not exists idx_trips_public on public.collaborative_trips (created_at desc) where is_public;

-- SECURITY DEFINER helper so the trip_items policy can check publicity without
-- re-entering RLS.
create or replace function public.is_trip_public(p_trip uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_public from public.collaborative_trips where id = p_trip), false);
$$;

-- Trips: participants OR anyone (if public) may read.
drop policy if exists "trips read participant" on public.collaborative_trips;
drop policy if exists "trips read participant or public" on public.collaborative_trips;
create policy "trips read participant or public" on public.collaborative_trips
  for select using (public.is_trip_participant(id) or is_public);

-- Itinerary items: participants OR (the trip is public) may read.
drop policy if exists "trip_items read" on public.trip_items;
create policy "trip_items read" on public.trip_items
  for select using (public.is_trip_participant(trip_id) or public.is_trip_public(trip_id));

-- Owner-only publish toggle.
create or replace function public.set_trip_public(p_trip uuid, p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.trip_role(p_trip, auth.uid()) is distinct from 'owner' then raise exception 'Owner only.'; end if;
  update public.collaborative_trips set is_public = p_public where id = p_trip;
end $$;
grant execute on function public.set_trip_public(uuid, boolean) to authenticated;

-- Clone a public (or your own) trip into a fresh personal trip you own, copying
-- the itinerary stops (not the chat).
create or replace function public.clone_trip(p_source uuid)
returns public.collaborative_trips language plpgsql security definer set search_path = public as $$
declare v_trip public.collaborative_trips;
begin
  if not exists (
    select 1 from public.collaborative_trips t
    where t.id = p_source and (t.is_public or public.is_trip_participant(t.id, auth.uid()))
  ) then raise exception 'Trip not available to clone.'; end if;

  insert into public.collaborative_trips (title, market, start_date, end_date, created_by)
  select title || ' (copy)', market, start_date, end_date, auth.uid()
  from public.collaborative_trips where id = p_source
  returning * into v_trip;

  insert into public.trip_participants (trip_id, user_id, role) values (v_trip.id, auth.uid(), 'owner');

  insert into public.trip_items (trip_id, venue_id, event_id, day_date, sort_order, note, added_by)
  select v_trip.id, venue_id, event_id, day_date, sort_order, note, auth.uid()
  from public.trip_items where trip_id = p_source;

  return v_trip;
end $$;
grant execute on function public.clone_trip(uuid) to authenticated;

-- Community Blueprints feed: public trips + their stop counts.
create or replace function public.list_public_trips(p_limit integer default 20)
returns table (id uuid, title text, market text, start_date date, end_date date, created_by uuid, created_at timestamptz, item_count bigint)
language sql stable security definer set search_path = public as $$
  select ct.id, ct.title, ct.market, ct.start_date, ct.end_date, ct.created_by, ct.created_at,
         (select count(*) from public.trip_items ti where ti.trip_id = ct.id) as item_count
  from public.collaborative_trips ct
  where ct.is_public
  order by ct.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.list_public_trips(integer) to anon, authenticated;
