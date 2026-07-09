import { supabase } from './supabase';
import { normalizeVenue, normalizeEvent } from './feed';

// Admin-only catalog management. All writes go through the SECURITY DEFINER
// RPCs (delete_venue / delete_event), which re-check is_admin() server-side —
// the client gating below is UX, not the security boundary.

// Thrown when delete_venue blocks because events still reference the venue.
// Carries the count so the caller can warn ("3 events use this venue") and
// offer to cascade.
export class VenueHasEventsError extends Error {
  constructor(count) {
    super(`VENUE_HAS_EVENTS:${count}`);
    this.name = 'VenueHasEventsError';
    this.count = count;
  }
}

// How many events still point at this venue (drives the pre-delete warning).
export async function venueEventCount(venueId) {
  const { data, error } = await supabase.rpc('venue_event_count', { p_id: venueId });
  if (error) throw error;
  return data ?? 0;
}

// Delete a venue. Without cascade, the RPC raises 'VENUE_HAS_EVENTS:<n>' when
// events reference it — we translate that into a typed error. With cascade the
// dependent events (and their saved/budget items) are removed first server-side.
export async function deleteVenue(venueId, { cascade = false } = {}) {
  const { error } = await supabase.rpc('delete_venue', { p_id: venueId, p_cascade: cascade });
  if (error) {
    const m = /VENUE_HAS_EVENTS:(\d+)/.exec(error.message ?? '');
    if (m) throw new VenueHasEventsError(Number(m[1]));
    throw error;
  }
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.rpc('delete_event', { p_id: eventId });
  if (error) throw error;
}

// Editorial: mark/unmark a venue as an Editor's Pick (admin-gated RPC).
export async function setVenueFeatured(venueId, featured) {
  const { error } = await supabase.rpc('set_venue_featured', { p_id: venueId, p_featured: featured });
  if (error) throw error;
}

// Single dispatch used by the Detail/Manage delete buttons.
export async function deleteListing(kind, id, opts) {
  return kind === 'venue' ? deleteVenue(id, opts) : deleteEvent(id);
}

// Past-events archive. The live feed keeps events with start_time >= now, so
// the archive is the exact complement (start_time < now) — every event is in
// exactly one of {feed, archive}, so nothing ever vanishes. Kept, not deleted.
export async function fetchPastEvents(market) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('*, venues(name)')
    .eq('market', market)
    .lt('start_time', nowIso)
    .order('start_time', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeEvent);
}

// Admin manage-all: every venue (including stubs) and every upcoming event in a
// market, normalized to FeedItems. Unlike the public feed this does NOT filter
// is_stub or by date — it's the full catalog the admin curates. Past events are
// surfaced separately via fetchPastEvents.
export async function fetchManageVenues(market) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('market', market)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeVenue);
}

export async function fetchManageUpcomingEvents(market) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('*, venues(name)')
    .eq('market', market)
    .gte('start_time', nowIso)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(normalizeEvent);
}
