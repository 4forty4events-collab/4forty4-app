import React, { useMemo } from 'react';
import { useRecentlyViewed } from '../../lib/discovery/hooks/useRecentlyViewed';
import { useDiscovery } from '../../lib/discovery/hooks/useDiscovery';
import { discoveryService } from '../../lib/discovery/services/discoveryService';
import { categoryLabel } from '../../lib/categories';
import { ShelfView } from './ShelfView';

// A disabled hook still needs a well-formed (empty) query; this keeps its cache key
// stable so a signed-out / no-history render doesn't thrash.
const EMPTY_QUERY = {};

// "Continue exploring" — anticipates intent instead of waiting for a search. It reads
// the category the user has viewed MOST (from Recently-viewed history) and surfaces
// more of it, minus what they've already opened. Pure client composition over the
// existing engine (topRated + interactions) — no new data path. Hidden until there's
// enough history to infer a lean.
export function ContinueExploringShelf({ userId, market, onPressItem }) {
  const { data: recent } = useRecentlyViewed(userId, market);

  const topCategory = useMemo(() => {
    if (!recent?.length) return null;
    const counts = new Map();
    for (const it of recent) {
      if (it.category) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    }
    let best = null;
    let bestN = 1; // need at least 2 views in a category to call it a lean
    for (const [cat, n] of counts) {
      if (n > bestN) { best = cat; bestN = n; }
    }
    return best;
  }, [recent]);

  const query = useMemo(
    () => (topCategory ? discoveryService.topRated({ market, categories: [topCategory] }) : null),
    [market, topCategory],
  );
  const { items, isLoading } = useDiscovery(query ?? EMPTY_QUERY, { enabled: !!query, staleTime: 120_000 });

  if (!topCategory) return null;

  // Don't recommend what they've already seen.
  const seen = new Set((recent ?? []).map((r) => `${r.kind}-${r.id}`));
  const fresh = (items ?? []).filter((it) => !seen.has(`${it.kind}-${it.id}`));

  return (
    <ShelfView
      title={`More ${categoryLabel(topCategory)}`}
      subtitle="Because you’ve been exploring"
      items={fresh}
      isLoading={isLoading}
      onPressItem={onPressItem}
    />
  );
}
