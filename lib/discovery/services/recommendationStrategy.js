import { createQuery } from '../query';
import { fetchDiscoverPage } from '../repositories/discoveryRepository';
import { fetchForYouPage } from '../repositories/recommendationsRepository';

// Recommendation strategies — the swappable brain behind the "For You" shelf.
// A strategy implements ONE method: fetchPage(context, cursor) => { items,
// nextCursor } (the standard page shape), so the shelf/hook never changes when
// the brain changes. context = { userId, market, near, limit }.
//
// The pattern lets us upgrade recommendation quality (heuristic -> interaction-
// based -> ML) by pointing `activeStrategy` at a new implementation — nothing
// downstream (hook, ShelfView, screen) is touched.

// Interaction-based personalization (server-side recommend_for_user): ranks by
// the user's category preferences x quality, excludes what they've seen, and
// falls back to trending for cold-start users. This is the active brain now that
// we capture interactions.
export const PersonalizedStrategy = {
  key: 'personalized',
  fetchPage: (context, cursor) => fetchForYouPage(context, cursor),
};

// Non-personalized fallback (no data needed): near you if we have location, else
// trending. Kept as a clean alternative / degraded mode.
export const HeuristicStrategy = {
  key: 'heuristic',
  fetchPage: (context, cursor) => {
    const query = context.near
      ? createQuery({ market: context.market, near: { ...context.near, radiusM: 8000 }, sort: 'distance', limit: context.limit ?? 12 })
      : createQuery({ market: context.market, sort: 'trending', limit: context.limit ?? 12 });
    return fetchDiscoverPage(query, cursor);
  },
};

export const activeStrategy = PersonalizedStrategy;
