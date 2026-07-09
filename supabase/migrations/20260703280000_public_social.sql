-- Unified update: (1) category->tag backfill to enrich the RAG brain, (2) open
-- public trip chat, (3) participant realtime + subscribe RPC for public rooms.

-- ============================================================================
-- 1) CATEGORY -> TAG BACKFILL (only where tags are empty; never overwrites
--    manually-tagged venues like Prison Island / Fantasia Land)
-- ============================================================================
update public.venues
set tags = case category
  when 'restaurant'    then array['food', 'dining', 'group']
  when 'cafe'          then array['chill', 'cafe', 'casual', 'relax']
  when 'outdoor'       then array['outdoor', 'activity', 'adventure', 'nature']
  when 'culture'       then array['culture', 'historic', 'sightseeing']
  when 'landmark'      then array['culture', 'historic', 'sightseeing']
  when 'museum'        then array['culture', 'historic', 'sightseeing', 'art']
  when 'entertainment' then array['activity', 'group', 'fun']
  when 'tourism'       then array['activity', 'group', 'fun', 'sightseeing']
  when 'nightlife'     then array['nightlife', 'drinks', 'social', 'party']
  when 'sports'        then array['sport', 'activity', 'intense', 'adventure']
  when 'wellness'      then array['relax', 'wellness', 'chill']
  when 'park'          then array['chill', 'outdoor', 'family', 'relax']
  when 'hotel'         then array['stay', 'comfort', 'group']
  when 'shopping'      then array['shopping', 'group', 'casual']
  else tags
end
where (tags is null or cardinality(tags) = 0) and category is not null;

-- ============================================================================
-- 2) OPEN PUBLIC CHAT: on a public trip, any authenticated user may read + post
--    (chat stays participant-only on private trips).
-- ============================================================================
drop policy if exists "trip_messages read" on public.trip_messages;
drop policy if exists "trip_messages insert own" on public.trip_messages;
create policy "trip_messages read" on public.trip_messages for select
  using (public.is_trip_participant(trip_id) or public.is_trip_public(trip_id));
create policy "trip_messages insert own" on public.trip_messages for insert
  with check (
    (public.is_trip_participant(trip_id) or public.is_trip_public(trip_id))
    and user_id = auth.uid() and is_ai_response = false
  );

-- ============================================================================
-- 3) SUBSCRIBE TO PLAN: self-join a public trip's roster + realtime for the join
-- ============================================================================
alter table public.trip_participants replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.trip_participants; exception when duplicate_object then null; end;
end $$;

create or replace function public.subscribe_to_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_public(p_trip) then raise exception 'Trip is not public.'; end if;
  insert into public.trip_participants (trip_id, user_id, role)
  values (p_trip, auth.uid(), 'viewer')
  on conflict (trip_id, user_id) do nothing;
end $$;
grant execute on function public.subscribe_to_trip(uuid) to authenticated;
