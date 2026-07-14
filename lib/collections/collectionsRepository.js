import { supabase } from '../supabase';

// Data-access for personal Collections. Same two-nullable-FK shape as saved_items
// (venue_id XOR event_id). RLS scopes every read/write to the owner, so these calls
// never pass a user_id for membership — the parent collection's ownership gates it.

function col(kind) {
  return kind === 'venue' ? 'venue_id' : 'event_id';
}

// A user's collections, pinned first then newest, each with its item count.
export async function fetchCollections(userId) {
  const { data: cols, error } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!cols?.length) return [];

  const ids = cols.map((c) => c.id);
  const { data: members, error: mErr } = await supabase
    .from('collection_items')
    .select('collection_id')
    .in('collection_id', ids);
  if (mErr) throw mErr;

  const counts = new Map();
  for (const m of members ?? []) counts.set(m.collection_id, (counts.get(m.collection_id) ?? 0) + 1);
  return cols.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
}

export async function createCollection(userId, { name, emoji = null }) {
  const { data, error } = await supabase
    .from('collections')
    .insert({ user_id: userId, name: name.trim(), emoji })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, count: 0 };
}

export async function renameCollection(id, { name, emoji }) {
  const patch = { updated_at: new Date().toISOString() };
  if (name != null) patch.name = name.trim();
  if (emoji !== undefined) patch.emoji = emoji;
  const { error } = await supabase.from('collections').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setCollectionPinned(id, pinned) {
  const { error } = await supabase.from('collections').update({ is_pinned: pinned }).eq('id', id);
  if (error) throw error;
}

export async function deleteCollection(id) {
  // collection_items cascade via FK.
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) throw error;
}

// Short, URL-safe share slug (random, non-guessable enough for a shared link).
function makeSlug() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

// Toggle a collection public/private. Making it public mints a share_slug once
// (kept stable across re-shares so an already-shared link never breaks). Returns
// the effective slug. A DB trigger writes the 'shared_collection' activity row.
export async function setCollectionPublic(id, isPublic) {
  const { data: cur, error: readErr } = await supabase
    .from('collections').select('share_slug').eq('id', id).single();
  if (readErr) throw readErr;
  const patch = { is_public: isPublic };
  if (isPublic && !cur?.share_slug) patch.share_slug = makeSlug();
  const { data, error } = await supabase
    .from('collections').update(patch).eq('id', id).select('share_slug').single();
  if (error) throw error;
  return data?.share_slug ?? cur?.share_slug ?? null;
}

// Resolve a shared collection from its slug (for an inbound deep link). RLS lets a
// public collection through cross-user; returns null if it's private or missing.
export async function fetchCollectionBySlug(slug) {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('share_slug', slug)
    .eq('is_public', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Another user's PUBLIC collections (RLS lets these through cross-user), with counts.
export async function fetchPublicCollections(userId) {
  const { data: cols, error } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!cols?.length) return [];

  const ids = cols.map((c) => c.id);
  const { data: members } = await supabase.from('collection_items').select('collection_id').in('collection_id', ids);
  const counts = new Map();
  for (const m of members ?? []) counts.set(m.collection_id, (counts.get(m.collection_id) ?? 0) + 1);
  return cols.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
}

export async function addToCollection(collectionId, kind, id) {
  const { error } = await supabase.from('collection_items').insert({
    collection_id: collectionId,
    venue_id: kind === 'venue' ? id : null,
    event_id: kind === 'event' ? id : null,
  });
  if (error && error.code !== '23505') throw error; // already in the collection
}

export async function removeFromCollection(collectionId, kind, id) {
  const { error } = await supabase
    .from('collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq(col(kind), id);
  if (error) throw error;
}

// Which of the user's collections already contain this listing (for checkmarks in
// the add sheet). RLS ensures only the caller's collections are visible.
export async function fetchCollectionIdsForItem(kind, id) {
  const { data, error } = await supabase
    .from('collection_items')
    .select('collection_id')
    .eq(col(kind), id);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.collection_id));
}

// Resolve a collection's members into FeedItems, newest-added first. Same by-id
// resolution as saved_items so stubs / past events the user chose to keep still show.
export async function fetchCollectionItems(collectionId, normalizeVenue, normalizeEvent) {
  const { data: rows, error } = await supabase
    .from('collection_items')
    .select('venue_id, event_id, added_at')
    .eq('collection_id', collectionId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];

  const venueIds = rows.filter((r) => r.venue_id).map((r) => r.venue_id);
  const eventIds = rows.filter((r) => r.event_id).map((r) => r.event_id);
  const [venuesRes, eventsRes] = await Promise.all([
    venueIds.length ? supabase.from('venues').select('*').in('id', venueIds) : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from('events').select('*, venues(name)').in('id', eventIds) : Promise.resolve({ data: [] }),
  ]);
  if (venuesRes.error) throw venuesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const byKey = new Map();
  (venuesRes.data ?? []).forEach((v) => byKey.set(`venue-${v.id}`, normalizeVenue(v)));
  (eventsRes.data ?? []).forEach((e) => byKey.set(`event-${e.id}`, normalizeEvent(e)));
  return rows
    .map((r) => byKey.get(r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`))
    .filter(Boolean);
}
