import React from 'react';
import { useDiscovery } from '../../lib/discovery/hooks/useDiscovery';
import { ShelfView } from './ShelfView';

// A horizontal preview row backed by a DiscoveryQuery. Every themed row —
// Trending, Nearby, New, Weekend, Editor's Picks — is this one component with a
// different query; adding a shelf is adding a query, not a screen. Shows the
// first page only (a preview) and renders nothing when empty (via ShelfView).
//
// `fallbackQuery` keeps an essential row alive when the catalog is thin: if the
// primary query comes back empty, the shelf quietly serves the fallback instead
// (e.g. Editor's Picks -> Top Rated) so a section the user expects is never blank.
export function Shelf({ title, subtitle, query, fallbackQuery, onPressItem, onSeeAll, variant }) {
  const primary = useDiscovery(query, { staleTime: 120_000 });
  const useFallback = !!fallbackQuery && !primary.isLoading && (primary.items?.length ?? 0) === 0;
  const fallback = useDiscovery(fallbackQuery ?? query, { enabled: useFallback, staleTime: 120_000 });

  const items = useFallback ? fallback.items : primary.items;
  const isLoading = primary.isLoading || (useFallback && fallback.isLoading);
  return (
    <ShelfView
      title={title}
      subtitle={subtitle}
      items={items}
      isLoading={isLoading}
      onPressItem={onPressItem}
      onSeeAll={onSeeAll}
      variant={variant}
    />
  );
}
