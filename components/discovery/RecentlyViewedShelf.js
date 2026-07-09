import React from 'react';
import { useRecentlyViewed } from '../../lib/discovery/hooks/useRecentlyViewed';
import { ShelfView } from './ShelfView';

// User history shelf. Same look as the query-backed shelves, but its data is the
// interactions table (not the discover RPC), so it renders through ShelfView
// directly. Hidden when signed-out or empty.
export function RecentlyViewedShelf({ userId, market, onPressItem }) {
  const { data: items, isLoading } = useRecentlyViewed(userId, market);
  return (
    <ShelfView
      title="Recently viewed"
      subtitle="Jump back in"
      items={items}
      isLoading={isLoading}
      onPressItem={onPressItem}
    />
  );
}
