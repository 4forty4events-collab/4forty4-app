import { useQuery } from '@tanstack/react-query';
import { fetchRecentlyViewed } from '../interactions';
import { sortImagesFirst } from '../../feed';

// Recently-viewed history for the signed-in user (per market). A plain query (not
// infinite) — it's a short capped list, not a feed. `select` floats image-bearing
// items to the front so placeholders never lead the shelf.
export function useRecentlyViewed(userId, market) {
  return useQuery({
    queryKey: ['recentlyViewed', userId ?? null, market ?? null],
    queryFn: () => fetchRecentlyViewed(userId, market),
    enabled: !!userId && !!market,
    staleTime: 30_000,
    select: sortImagesFirst,
  });
}
