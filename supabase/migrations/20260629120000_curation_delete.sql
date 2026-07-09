-- Curation Toolkit: admin delete for venues + events, with FK-safety.
--
-- FK landscape (verified against the live project):
--   events.venue_id              -> venues  ON DELETE SET NULL   (DANGER: orphans events)
--   saved_items.venue_id         -> venues  ON DELETE CASCADE
--   budget_items.venue_id        -> venues  ON DELETE CASCADE
--   content_drafts.published_venue_id -> venues ON DELETE SET NULL
--   saved_items.event_id         -> events  ON DELETE CASCADE
--   budget_items.event_id        -> events  ON DELETE CASCADE
--   content_drafts.published_event_id -> events ON DELETE SET NULL
--
-- Deleting an EVENT is fully safe: every referencing row either cascades or
-- nulls automatically. Deleting a VENUE is NOT: events.venue_id is SET NULL,
-- so a blind delete leaves orphan events (an event "at" a venue that no longer
-- exists). So delete_venue counts referencing events and BLOCKS by default,
-- only force-deleting them when the caller explicitly cascades.

-- Count of events still pointing at a venue. Drives the pre-delete warning in
-- the UI. Admin-gated for consistency (it is otherwise harmless/read-only).
create or replace function public.venue_event_count(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;
  select count(*) into v_count from public.events where venue_id = p_id;
  return v_count;
end;
$$;

-- Delete a venue. If events reference it and p_cascade is false, raise a
-- machine-parseable error ('VENUE_HAS_EVENTS:<n>') so the client can warn and
-- offer to cascade. With p_cascade true, delete those events FIRST (their
-- saved_items/budget_items cascade away with them) so no orphan is ever left,
-- then delete the venue.
create or replace function public.delete_venue(p_id uuid, p_cascade boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  select count(*) into v_event_count from public.events where venue_id = p_id;

  if v_event_count > 0 and not p_cascade then
    raise exception 'VENUE_HAS_EVENTS:%', v_event_count;
  end if;

  if p_cascade then
    -- Remove dependent events first; saved_items/budget_items on those events
    -- cascade. This is what prevents events.venue_id SET NULL from orphaning.
    delete from public.events where venue_id = p_id;
  end if;

  delete from public.venues where id = p_id;
end;
$$;

-- Delete an event. All references (saved_items, budget_items, content_drafts)
-- clean up via their existing FK rules; nothing to do by hand.
create or replace function public.delete_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  delete from public.events where id = p_id;
end;
$$;

-- RLS delete policies (defense in depth — the functions above are SECURITY
-- DEFINER and already admin-gated, but lock down any direct client delete too).
drop policy if exists "admin delete venues" on public.venues;
create policy "admin delete venues" on public.venues
  for delete using (public.is_admin());

drop policy if exists "admin delete events" on public.events;
create policy "admin delete events" on public.events
  for delete using (public.is_admin());
