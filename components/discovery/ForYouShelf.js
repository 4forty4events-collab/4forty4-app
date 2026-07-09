import React from 'react';
import { useForYou } from '../../lib/discovery/hooks/useForYou';
import { ShelfView } from './ShelfView';

// The personalized shelf. Renders through the same ShelfView as every other
// shelf; its data comes from the active RecommendationStrategy. Hidden when empty.
export function ForYouShelf({ userId, market, coords, onPressItem }) {
  const { items, isLoading } = useForYou({ userId, market, near: coords });
  return (
    <ShelfView
      title="For You"
      subtitle="Based on what you explore"
      items={items}
      isLoading={isLoading}
      onPressItem={onPressItem}
    />
  );
}
