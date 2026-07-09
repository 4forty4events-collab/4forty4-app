-- Feature A (coordination-ai-curator): give every AI suggestion card a first-class
-- list of the target ids it put on the table. The curator reads venue_ids across
-- recent messages to exclude everything already offered (and everything the group
-- removed), instead of re-parsing the payload shape each time.
alter table public.trip_messages
  add column if not exists venue_ids jsonb not null default '[]'::jsonb;

-- Shared delete path (step 2a removal + itinerary tab delete): drop a pinned stop
-- AND record the removed target as a system card carrying venue_ids, so the curator
-- treats it as excluded from now on. Editors act as themselves; the curator Edge
-- Function runs under the service role (auth.uid() is null) and is trusted.
create or replace function public.remove_trip_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_trip   uuid;
  v_target uuid;
  v_name   text;
begin
  select ti.trip_id,
         coalesce(ti.venue_id, ti.event_id),
         coalesce(v.name, e.title)
    into v_trip, v_target, v_name
  from public.trip_items ti
  left join public.venues v on v.id = ti.venue_id
  left join public.events e on e.id = ti.event_id
  where ti.id = p_item;

  if v_trip is null then
    return;                     -- already gone; nothing to do
  end if;

  -- Authenticated callers must be an editor of this trip. The service role
  -- (auth.uid() is null) bypasses this check.
  if auth.uid() is not null and not public.is_trip_editor(v_trip) then
    raise exception 'Not allowed.';
  end if;

  delete from public.trip_items where id = p_item;

  insert into public.trip_messages (trip_id, user_id, is_ai_response, body, venue_ids)
  values (v_trip, null, true,
          'Removed ' || coalesce(v_name, 'that stop') || ' from the plan.',
          jsonb_build_array(v_target));
end $$;

revoke execute on function public.remove_trip_item(uuid) from public, anon;
grant  execute on function public.remove_trip_item(uuid) to authenticated;
