import { supabase } from '../supabase';
import { formatVenueTitle } from '../format';

// Coordination Engine data-access layer. Framework-agnostic, camelCase. Covers
// community place requests + collaborative trips (rooms, roster, itinerary, chat).
// Trip membership/permissions are enforced by RLS + SECURITY DEFINER RPCs; this
// layer is UX convenience, not the security boundary.

// ---- shared: hydrate display names from the public_profiles view -----------
async function hydrateNames(userIds) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('id, full_name, avatar_url, trust_tier').in('id', ids);
  if (error) throw error;
  const map = new Map();
  (data ?? []).forEach((p) => map.set(p.id, { id: p.id, name: p.full_name ?? null, avatarUrl: p.avatar_url ?? null, trustTier: p.trust_tier ?? 'standard' }));
  return map;
}

// ---- normalizers -----------------------------------------------------------
export function normalizeVenueRequest(row) {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    name: row.name,
    description: row.description ?? null,
    suggestedCategory: row.suggested_category ?? null,
    status: row.status,
    adminNotes: row.admin_notes ?? null,
    market: row.market ?? null,
    createdAt: row.created_at,
  };
}

export function normalizeTrip(row) {
  return {
    id: row.id,
    title: row.title,
    market: row.market ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    createdBy: row.created_by,
    isPublic: row.is_public ?? false,
    createdAt: row.created_at,
  };
}

export function normalizeTripItem(row) {
  const target = row.venue ?? row.event ?? null;
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.venue_id ? 'venue' : 'event',
    targetId: row.venue_id ?? row.event_id,
    dayDate: row.day_date ?? null,
    sortOrder: row.sort_order ?? 0,
    note: row.note ?? null,
    addedBy: row.added_by ?? null,
    title: formatVenueTitle(target?.name ?? target?.title ?? null),
    coverImageUrl: target?.cover_image_url ?? null,
    createdAt: row.created_at,
  };
}

export function normalizeTripMessage(row, authors) {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    author: row.user_id ? (authors?.get(row.user_id) ?? { id: row.user_id, name: null }) : null,
    body: row.body ?? null,
    isAiResponse: !!row.is_ai_response,
    payload: row.payload ?? null,
    venueIds: Array.isArray(row.venue_ids) ? row.venue_ids : [],
    createdAt: row.created_at,
  };
}

const REQUEST_COLS = 'id, submitted_by, name, description, suggested_category, status, admin_notes, market, created_at';

// ---- community place requests ----------------------------------------------
export async function requestPlace(userId, { name, description, suggestedCategory, lat, lng, market }) {
  const row = {
    submitted_by: userId,
    name: name.trim(),
    description: description?.trim() || null,
    suggested_category: suggestedCategory ?? null,
    market: market ?? null,
  };
  if (lat != null && lng != null) row.coordinates = `SRID=4326;POINT(${lng} ${lat})`;
  const { data, error } = await supabase.from('venue_requests').insert(row).select(REQUEST_COLS).single();
  if (error) throw error;
  return normalizeVenueRequest(data);
}

export async function getMyVenueRequests(userId) {
  const { data, error } = await supabase.from('venue_requests')
    .select(REQUEST_COLS).eq('submitted_by', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeVenueRequest);
}

export async function listVenueRequests({ status = null } = {}) {
  let q = supabase.from('venue_requests').select(REQUEST_COLS).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalizeVenueRequest);
}

export async function reviewVenueRequest(id, status, notes = null) {
  const { error } = await supabase.rpc('review_venue_request', { p_id: id, p_status: status, p_notes: notes });
  if (error) throw error;
}

// ---- calendar feed ---------------------------------------------------------
// Upcoming saved events (not yet ended) — powers the calendar grid alongside trips.
export async function getUpcomingSavedEvents(userId) {
  const { data, error } = await supabase.from('saved_items')
    .select('event:events(id, title, start_time, end_time, cover_image_url)')
    .eq('user_id', userId).not('event_id', 'is', null);
  if (error) throw error;
  const now = Date.now();
  return (data ?? [])
    .map((r) => r.event).filter(Boolean)
    .filter((e) => new Date(e.end_time ?? e.start_time).getTime() >= now)
    .map((e) => ({ id: e.id, title: e.title, startTime: e.start_time, endTime: e.end_time ?? null, coverImageUrl: e.cover_image_url ?? null }))
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

// ---- collaborative trips ---------------------------------------------------
export async function createGroupTrip({ title, market, startDate, endDate }) {
  const { data, error } = await supabase.rpc('create_group_trip', {
    p_title: title, p_market: market ?? null, p_start: startDate ?? null, p_end: endDate ?? null,
  });
  if (error) throw error;
  return normalizeTrip(Array.isArray(data) ? data[0] : data);
}

// Trips I belong to, each tagged with my role (RLS scopes rows to my memberships).
export async function getMyTrips(userId) {
  const { data, error } = await supabase.from('trip_participants')
    .select('role, trip:collaborative_trips(*)').eq('user_id', userId);
  if (error) throw error;
  return (data ?? [])
    .filter((m) => m.trip)
    .map((m) => ({ ...normalizeTrip(m.trip), myRole: m.role }))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
}

export async function addParticipant(tripId, userId, role = 'viewer') {
  const { error } = await supabase.rpc('add_trip_participant', { p_trip: tripId, p_user: userId, p_role: role });
  if (error) throw error;
}

export async function removeParticipant(tripId, userId) {
  const { error } = await supabase.from('trip_participants').delete().eq('trip_id', tripId).eq('user_id', userId);
  if (error) throw error;
}

// The shared itinerary space: trip meta + roster (name-hydrated) + ordered stops.
export async function fetchTripItinerary(tripId) {
  const [{ data: trip, error: tErr }, { data: parts, error: pErr }, { data: items, error: iErr }] = await Promise.all([
    supabase.from('collaborative_trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_participants').select('user_id, role, added_at').eq('trip_id', tripId),
    supabase.from('trip_items')
      .select('*, venue:venues(id, name, cover_image_url), event:events(id, title, cover_image_url)')
      .eq('trip_id', tripId).order('day_date', { ascending: true }).order('sort_order', { ascending: true }),
  ]);
  if (tErr) throw tErr; if (pErr) throw pErr; if (iErr) throw iErr;

  const authors = await hydrateNames((parts ?? []).map((p) => p.user_id));
  return {
    trip: trip ? normalizeTrip(trip) : null,
    participants: (parts ?? []).map((p) => ({ userId: p.user_id, role: p.role, addedAt: p.added_at, ...(authors.get(p.user_id) ?? { name: null }) })),
    items: (items ?? []).map(normalizeTripItem),
  };
}

export async function addTripItem(tripId, target, { dayDate = null, note = null, sortOrder = 0, addedBy = null } = {}) {
  const row = { trip_id: tripId, venue_id: null, event_id: null, day_date: dayDate, note, sort_order: sortOrder, added_by: addedBy };
  row[`${target.type}_id`] = target.id;
  const { data, error } = await supabase.from('trip_items')
    .insert(row).select('*, venue:venues(id, name, cover_image_url), event:events(id, title, cover_image_url)').single();
  if (error) throw error;
  return normalizeTripItem(data);
}

// Delete a pinned stop via the shared server path (remove_trip_item): it removes
// the row AND records the target in a system card's venue_ids, so the AI curator
// treats the removed place as excluded from now on — same path the curator uses
// for "remove X" chat messages.
export async function removeTripItem(itemId) {
  const { error } = await supabase.rpc('remove_trip_item', { p_item: itemId });
  if (error) throw error;
}

// Manual edit of a pinned stop (slot label via note, day, or sort order). Rides
// the trip_items "editor write" RLS (FOR ALL) — no RPC needed. Used by reorder
// (swap sort_order) and the edit-stop sheet.
export async function updateTripItem(itemId, { dayDate, note, sortOrder } = {}) {
  const patch = {};
  if (dayDate !== undefined) patch.day_date = dayDate;
  if (note !== undefined) patch.note = note;
  if (sortOrder !== undefined) patch.sort_order = sortOrder;
  if (Object.keys(patch).length === 0) return null;
  const { data, error } = await supabase.from('trip_items')
    .update(patch).eq('id', itemId)
    .select('*, venue:venues(id, name, cover_image_url), event:events(id, title, cover_image_url)').single();
  if (error) throw error;
  return normalizeTripItem(data);
}

// Reorder a set of stops by writing an explicit sequential sort_order to each.
// Renumbering (not a 2-row swap) is robust against duplicate sort_orders — single
// AI adds default to 0, so a plain swap could leave ties. Rides editor-write RLS.
export async function reorderTripItems(orderedItems) {
  for (const it of orderedItems) {
    const { error } = await supabase.from('trip_items').update({ sort_order: it.sortOrder }).eq('id', it.id);
    if (error) throw error;
  }
}

// Admin: delete an entire plan (children first, then trip) via the is_admin-gated
// RPC. FK-safe. Used behind the admin gate on the trip workspace.
export async function adminDeleteTrip(tripId) {
  const { error } = await supabase.rpc('admin_delete_trip', { p_trip: tripId });
  if (error) throw error;
}

// Catalog search for the manual "+ Add stop" / "Add to trip" browser: real venues
// in the trip's market, name-filtered, best-rated first. Non-stub only.
export async function searchVenuesForPicker(market, query, { limit = 30 } = {}) {
  let q = supabase.from('venues')
    .select('id, name, category, cover_image_url, city, rating, price_per_person, price_type')
    .eq('market', market).eq('is_stub', false)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(limit);
  const term = (query ?? '').trim();
  if (term) q = q.ilike('name', `%${term}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((v) => ({
    id: v.id, name: v.name, category: v.category ?? null,
    coverImageUrl: v.cover_image_url ?? null, city: v.city ?? null, rating: v.rating ?? null,
  }));
}

// Batch insert (full-day bundle). items: [{ target:{type,id}, dayDate, note, sortOrder }].
export async function addTripItems(tripId, items, addedBy = null) {
  const rows = items.map((it, i) => {
    const r = { trip_id: tripId, venue_id: null, event_id: null, day_date: it.dayDate ?? null, note: it.note ?? null, sort_order: it.sortOrder ?? i, added_by: addedBy };
    r[`${it.target.type}_id`] = it.target.id;
    return r;
  });
  const { data, error } = await supabase.from('trip_items')
    .insert(rows).select('*, venue:venues(id, name, cover_image_url), event:events(id, title, cover_image_url)');
  if (error) throw error;
  return (data ?? []).map(normalizeTripItem);
}

// ---- public blueprints -----------------------------------------------------
export async function setTripPublic(tripId, isPublic) {
  const { error } = await supabase.rpc('set_trip_public', { p_trip: tripId, p_public: isPublic });
  if (error) throw error;
}

export async function fetchPublicTrips({ limit = 20 } = {}) {
  const { data, error } = await supabase.rpc('list_public_trips', { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...normalizeTrip(t), itemCount: Number(t.item_count ?? 0) }));
}

export async function cloneTrip(sourceTripId) {
  const { data, error } = await supabase.rpc('clone_trip', { p_source: sourceTripId });
  if (error) throw error;
  return normalizeTrip(Array.isArray(data) ? data[0] : data);
}

// Self-join a public trip's roster as a viewer.
export async function subscribeToTrip(tripId) {
  const { error } = await supabase.rpc('subscribe_to_trip', { p_trip: tripId });
  if (error) throw error;
}

// Admin: paste a social post into the external_itineraries RAG source.
export async function adminIngestItinerary({ market, body, handle, url, locationText }) {
  const { data, error } = await supabase.rpc('admin_ingest_external_itinerary', {
    p_market: market, p_body: body, p_handle: handle ?? null, p_url: url ?? null, p_location_text: locationText ?? null,
  });
  if (error) throw error;
  return data;
}

// ---- trip chat -------------------------------------------------------------
export async function sendTripMessage(tripId, userId, { body, payload = null }) {
  const { data, error } = await supabase.from('trip_messages')
    .insert({ trip_id: tripId, user_id: userId, body: body?.trim() || null, payload, is_ai_response: false })
    .select('*').single();
  if (error) throw error;
  return normalizeTripMessage(data);
}

export async function fetchTripMessages(tripId, { limit = 50 } = {}) {
  const { data, error } = await supabase.from('trip_messages')
    .select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []).reverse(); // chronological for display
  const authors = await hydrateNames(rows.map((r) => r.user_id));
  return rows.map((r) => normalizeTripMessage(r, authors));
}
