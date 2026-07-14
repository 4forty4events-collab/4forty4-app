import { createQuery } from '../query';
import { fetchDiscoverPage } from '../repositories/discoveryRepository';

// Domain layer: expresses discovery INTENTS as DiscoveryQuery builders, on top of
// the repository. Framework-agnostic (no React) and testable. Each capability is
// just "which query" — the paging/fetching is identical underneath, which is what
// makes this a reusable engine rather than a pile of screens.

export const fetchPage = fetchDiscoverPage;

export const discoveryService = {
  // General explore feed: newest first.
  feed: ({ market, categories = null } = {}) =>
    createQuery({ market, categories, sort: 'recent' }),

  // Nearby: needs the user's location; closest first. `limit` lets the map pull a
  // denser page of pins than the paginated list wants.
  nearby: ({ market, near, categories = null, radiusM = 5000, limit } = {}) =>
    createQuery({ market, categories, near: near ? { ...near, radiusM } : null, sort: 'distance', ...(limit ? { limit } : {}) }),

  // Universal search: fuzzy text, ranked by relevance. Advanced filters ride the
  // same query — kind (venue/event) and an explicit sort override the defaults.
  search: ({ market, text, categories = null, near = null, kinds = null, sort = 'relevance' } = {}) =>
    createQuery({ market, categories, text, near, kinds, sort }),

  // Shelf builders — each returns a query the same Shelf UI renders. Adding a
  // shelf = adding a builder here, not a screen.
  trending: ({ market } = {}) => createQuery({ market, sort: 'trending', limit: 12 }),
  topRated: ({ market, categories = null } = {}) => createQuery({ market, categories, sort: 'rating', limit: 12 }),
  newest: ({ market } = {}) => createQuery({ market, sort: 'recent', limit: 12 }),
  editorsPicks: ({ market } = {}) => createQuery({ market, featured: true, sort: 'rating', limit: 12 }),

  // Featured Today (the Discover hero). Same is_featured flag as Editor's Picks — an
  // explicit alias so the hero reads as "featured venues", toggled per-venue in Manage.
  featured: ({ market } = {}) => createQuery({ market, featured: true, sort: 'rating', limit: 12 }),
  weekend: ({ market } = {}) =>
    createQuery({ market, kinds: ['event'], startsBefore: endOfWeekendISO(), sort: 'recent', limit: 12 }),

  // Today: events happening today (between now and end of the local day). Powers the
  // Featured Today hero — falls back to featured venues when the catalog has none.
  today: ({ market } = {}) =>
    createQuery({ market, kinds: ['event'], startsBefore: endOfTodayISO(), sort: 'recent', limit: 12 }),

  // Underrated quality: high rating, modest review count (the `gems` sort bands
  // out unproven 1-review noise and already-mainstream spots server-side).
  hiddenGems: ({ market } = {}) => createQuery({ market, sort: 'gems', limit: 12 }),

  // Seasonal: the same top-rated shelf, scoped to the categories that fit the time
  // of year (the caller supplies them via getSeason — see lib/discovery/seasons).
  seasonal: ({ market, categories = null } = {}) =>
    createQuery({ market, categories, sort: 'rating', limit: 12 }),
};

// End of the upcoming (or current, if it's already the weekend) Sunday, as ISO.
// Events between now and this bound feed the "Weekend Ideas" shelf.
function endOfWeekendISO() {
  const d = new Date();
  const day = d.getDay();                 // 0 Sun ... 6 Sat
  const daysUntilSunday = (7 - day) % 7;  // 0 if today is Sunday
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// End of the current local day, as ISO — the upper bound for "today's events".
function endOfTodayISO() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
