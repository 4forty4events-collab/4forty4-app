import React, { useMemo } from 'react';
import { useDiscovery } from '../../lib/discovery/hooks/useDiscovery';
import { discoveryService } from '../../lib/discovery/services/discoveryService';
import { ShelfView } from './ShelfView';

const EMPTY_QUERY = {};

// Contextual cross-sell on a listing: "what's around this place?" Turns a single
// destination into a mini-plan by pulling nearby experiences (distance-sorted) from
// the item's real coordinates, excluding the item itself. This is the intelligence
// layer — a traveler viewing an attraction sees the cafés and restaurants a short
// walk away without asking. Renders nothing for items without coordinates (e.g.
// manually-entered events), so it never shows an empty or misleading row.
export function NearThisShelf({ item, market, onPressItem }) {
  const near = useMemo(
    () => (item?.latitude != null && item?.longitude != null
      ? { lat: item.latitude, lng: item.longitude }
      : null),
    [item?.latitude, item?.longitude],
  );

  const query = useMemo(
    () => (near ? discoveryService.nearby({ market, near, radiusM: 3000 }) : null),
    [market, near],
  );
  const { items, isLoading } = useDiscovery(query ?? EMPTY_QUERY, { enabled: !!query, staleTime: 120_000 });

  if (!near) return null;

  const around = (items ?? [])
    .filter((it) => !(it.kind === item.kind && it.id === item.id))
    .slice(0, 12);

  return (
    <ShelfView
      title="Near here"
      subtitle="A short walk away"
      items={around}
      isLoading={isLoading}
      onPressItem={onPressItem}
    />
  );
}
