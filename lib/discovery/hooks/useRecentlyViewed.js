import { useQuery } from '@tanstack/react-query';
import { fetchRecentlyViewed } from '../interactions';

// Recently-viewed history for the signed-in user (per market). A plain query (not
// infinite) — it's a short capped list, not a feed.
export function useRecentlyViewed(userId, market) {
  return useQuery({
    queryKey: ['recentlyViewed', userId ?? null, market ?? null],
    queryFn: () => fetchRecentlyViewed(userId, market),
    enabled: !!userId && !!market,
    staleTime: 30_000,
  });
}
