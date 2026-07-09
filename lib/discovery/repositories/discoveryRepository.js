import { supabase } from '../../supabase';
import { normalizeVenue, normalizeEvent } from '../../feed';

// The data-access boundary: the ONLY place that knows how discovery data is
// stored/fetched (today: the `discover` Postgres RPC). It maps a DiscoveryQuery
// + cursor to one page of normalized FeedItems and the next cursor. Swapping the
// backend later (a dedicated search service, an edge function) touches only this
// file — services, hooks, and UI never change.

// One page of discovery results. `cursor` is the opaque keyset from the previous
// page ({ v, id }) or null for the first page.
export async function fetchDiscoverPage(query, cursor = null) {
  const near = query.near ?? null;
  const limit = query.limit ?? 20;

  const { data, error } = await supabase.rpc('discover', {
    p_market: query.market,
    p_categories: query.categories ?? null,
    p_text: query.text ?? null,
    p_lat: near?.lat ?? null,
    p_lng: near?.lng ?? null,
    p_radius_m: near?.radiusM ?? null,
    p_kinds: query.kinds ?? null,
    p_sort: query.sort ?? 'recent',
    p_cursor: cursor ?? null,
    p_limit: limit,
    p_starts_before: query.startsBefore ?? null,
    p_featured: query.featured ?? false,
  });
  if (error) throw error;

  const rows = data ?? [];
  const items = rows.map((row) => {
    const base = row.kind === 'venue' ? normalizeVenue(row.item) : normalizeEvent(row.item);
    // Distance (meters) comes from PostGIS, not the client — attach it to the
    // FeedItem so cards can show "1.2 km away" without recomputing.
    return { ...base, distanceM: row.distance_m ?? null };
  });

  // A short page means we've reached the end. Otherwise the next cursor is the
  // last row's (sort value, id) — echoed straight back to the RPC.
  const last = rows.length ? rows[rows.length - 1] : null;
  const nextCursor = rows.length < limit || !last ? null : { v: last.sort_v, id: last.out_id };

  return { items, nextCursor };
}
