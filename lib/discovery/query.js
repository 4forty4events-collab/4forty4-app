// The single DiscoveryQuery contract. Every discovery capability — feed, nearby,
// search, trending, a collection — is this one object with different values,
// flowing unchanged through hook -> service -> repository -> the `discover` RPC.
// Add a capability by building a query, never by adding a data path.

export const SORTS = ['recent', 'distance', 'rating', 'trending', 'relevance', 'gems'];

// Build a normalized query. `market` is the only required field; everything else
// has a sensible default so callers only specify what they mean to change.
export function createQuery({
  market,
  categories = null,      // string[] | null (null = all)
  text = null,            // fuzzy search string | null
  near = null,            // { lat, lng, radiusM } | null
  kinds = null,           // ['venue'|'event'] | null (null = both)
  sort = 'recent',
  limit = 20,
  startsBefore = null,    // ISO string — event start ceiling (Weekend/date shelves)
  featured = false,       // editorial Editor's Picks only
} = {}) {
  return { market, categories, text, near, kinds, sort, limit, startsBefore, featured };
}

// Stable, serializable cache key for TanStack Query. Same query -> same key ->
// shared cache + request dedup. `near` is rounded so tiny GPS jitter doesn't
// thrash the cache (a few meters never changes the result meaningfully).
export function queryKey(q) {
  const near = q.near
    ? { lat: round(q.near.lat, 3), lng: round(q.near.lng, 3), radiusM: q.near.radiusM ?? null }
    : null;
  return [
    'discover',
    q.market ?? null,
    q.categories ?? null,
    (q.text ?? '').trim().toLowerCase() || null,
    near,
    q.kinds ?? null,
    q.sort ?? 'recent',
    q.limit ?? 20,
    q.startsBefore ?? null,
    q.featured ?? false,
  ];
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
