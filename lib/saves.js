import { supabase } from './supabase';

// saved_items stores the listing as one of two nullable FK columns; exactly one
// is set per row. kind picks which.
function col(kind) {
  return kind === 'venue' ? 'venue_id' : 'event_id';
}

export async function isListingSaved(userId, kind, id) {
  const { data, error } = await supabase
    .from('saved_items')
    .select('id')
    .eq('user_id', userId)
    .eq(col(kind), id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function addSave(userId, kind, id, { list = 'favorite' } = {}) {
  const { error } = await supabase.from('saved_items').insert({
    user_id: userId,
    venue_id: kind === 'venue' ? id : null,
    event_id: kind === 'event' ? id : null,
    list_type: list,
  });
  // 23505 = unique violation: already saved (double-tap race). Treat as success.
  if (error && error.code !== '23505') throw error;
}

export async function removeSave(userId, kind, id) {
  const { error } = await supabase
    .from('saved_items')
    .delete()
    .eq('user_id', userId)
    .eq(col(kind), id);
  if (error) throw error;
}

// Full save state for a listing — powers Detail's favorite/wishlist controls in
// one read. { saved, list, pinned }.
export async function getSaveState(userId, kind, id) {
  const { data, error } = await supabase
    .from('saved_items')
    .select('list_type, pinned')
    .eq('user_id', userId)
    .eq(col(kind), id)
    .maybeSingle();
  if (error) throw error;
  return { saved: !!data, list: data?.list_type ?? null, pinned: !!data?.pinned };
}

// Put a listing on a specific list ('favorite' | 'wishlist'), saving it if needed.
// This is the mover: tapping Wishlist on an already-favorited place reclassifies it
// rather than creating a duplicate (the partial-unique index forbids two rows).
export async function setSaveList(userId, kind, id, list) {
  const { data, error } = await supabase
    .from('saved_items')
    .update({ list_type: list })
    .eq('user_id', userId)
    .eq(col(kind), id)
    .select('id');
  if (error) throw error;
  if (!data?.length) await addSave(userId, kind, id, { list });
}

export async function setSavePinned(userId, kind, id, pinned) {
  const { error } = await supabase
    .from('saved_items')
    .update({ pinned })
    .eq('user_id', userId)
    .eq(col(kind), id);
  if (error) throw error;
}

// Resolve a user's saves into FeedItems, pinned first then newest-saved. Fetched by
// id directly (not through the feed filters) so a saved stub or past event still
// shows — the user chose to save it. `list` filters to 'favorite' | 'wishlist'
// (omit for all lists).
export async function fetchSavedItems(userId, normalizeVenue, normalizeEvent, { list } = {}) {
  let q = supabase
    .from('saved_items')
    .select('venue_id, event_id, saved_at, pinned')
    .eq('user_id', userId);
  if (list) q = q.eq('list_type', list);
  const { data: rows, error } = await q
    .order('pinned', { ascending: false })
    .order('saved_at', { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];

  const venueIds = rows.filter((r) => r.venue_id).map((r) => r.venue_id);
  const eventIds = rows.filter((r) => r.event_id).map((r) => r.event_id);

  const [venuesRes, eventsRes] = await Promise.all([
    venueIds.length
      ? supabase.from('venues').select('*').in('id', venueIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabase.from('events').select('*, venues(name)').in('id', eventIds)
      : Promise.resolve({ data: [] }),
  ]);
  if (venuesRes.error) throw venuesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const byKey = new Map();
  (venuesRes.data ?? []).forEach((v) => byKey.set(`venue-${v.id}`, normalizeVenue(v)));
  (eventsRes.data ?? []).forEach((e) => byKey.set(`event-${e.id}`, normalizeEvent(e)));

  // Preserve pinned/saved ordering; drop any row whose target was since deleted.
  // Attach `savedPinned` so the Saved UI can label the pin toggle without a re-read.
  return rows
    .map((r) => {
      const it = byKey.get(r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`);
      return it ? { ...it, savedPinned: !!r.pinned } : null;
    })
    .filter(Boolean);
}
