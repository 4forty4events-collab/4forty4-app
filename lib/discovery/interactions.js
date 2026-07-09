import { supabase } from '../supabase';
import { normalizeVenue, normalizeEvent } from '../feed';

// Interaction capture — the data foundation for Recently Viewed (now) and
// personalization (later). Writes are fire-and-forget: a discovery UI must never
// stall or fail because a tracking insert did. Signed-in users only (needs a
// user_id); guests silently no-op.

export async function recordInteraction(userId, listing, type) {
  if (!userId || !listing?.id) return;
  try {
    const { error } = await supabase.from('interactions').insert({
      user_id: userId,
      venue_id: listing.kind === 'venue' ? listing.id : null,
      event_id: listing.kind === 'event' ? listing.id : null,
      type,
      market: listing.market ?? null,
    });
    // Best-effort, but surface failures in dev so a silently-broken capture (RLS,
    // auth mismatch, constraint) is visible instead of invisibly starving
    // Recently Viewed / For You of data.
    if (error && __DEV__) console.warn('[interactions] capture failed:', type, error.message);
  } catch (e) {
    if (__DEV__) console.warn('[interactions] capture threw:', e?.message ?? e);
  }
}

// The user's recently-viewed items in the current market, newest first, deduped
// to the latest view per item. Reads interactions, then hydrates the referenced
// venues/events through the shared normalizers.
export async function fetchRecentlyViewed(userId, market, limit = 12) {
  if (!userId || !market) return [];

  const { data: rows, error } = await supabase
    .from('interactions')
    .select('venue_id, event_id, created_at')
    .eq('user_id', userId)
    .eq('type', 'view')
    .order('created_at', { ascending: false })
    .limit(limit * 4); // headroom for dedup
  if (error) throw error;
  if (!rows?.length) return [];

  const seen = new Set();
  const ordered = [];
  for (const r of rows) {
    const key = r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ key, venueId: r.venue_id, eventId: r.event_id });
    if (ordered.length >= limit) break;
  }

  const venueIds = ordered.filter((o) => o.venueId).map((o) => o.venueId);
  const eventIds = ordered.filter((o) => o.eventId).map((o) => o.eventId);
  const [vres, eres] = await Promise.all([
    venueIds.length
      ? supabase.from('venues').select('*').in('id', venueIds).eq('market', market).eq('is_stub', false)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabase.from('events').select('*, venues(name)').in('id', eventIds).eq('market', market)
      : Promise.resolve({ data: [] }),
  ]);
  if (vres.error) throw vres.error;
  if (eres.error) throw eres.error;

  const byKey = new Map();
  (vres.data ?? []).forEach((v) => byKey.set(`venue-${v.id}`, normalizeVenue(v)));
  (eres.data ?? []).forEach((e) => byKey.set(`event-${e.id}`, normalizeEvent(e)));

  return ordered.map((o) => byKey.get(o.key)).filter(Boolean);
}
