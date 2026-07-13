import React, { useCallback, useState } from 'react';
import { View, FlatList, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native';
import { ExperienceCard } from './ExperienceCard';
import { ShelfRevealContext } from './LazyShelf';
import { useDiscovery } from '../../lib/discovery/hooks/useDiscovery';
import { useSession } from '../../providers/SessionProvider';
import { AddToTripSheet } from '../coordination/AddToTripSheet';
import { AppText, colors, space } from '../../lib/theme';
import { Button } from '../ui/Button';

// How far below the fold a shelf is mounted (px). Big enough that covers finish loading
// before the shelf slides into view; quantized so scrolling only bumps the reveal line in
// coarse steps rather than on every frame.
const REVEAL_BUFFER = 600;
const REVEAL_STEP = 300;

// The main vertical discovery surface: a DiscoveryQuery in, an infinitely
// paginated, cached list out. Handles loading / empty / error / end-of-list and
// pull-to-refresh so screens don't reimplement any of it. `ListHeaderComponent`
// lets a screen mount chrome (filters, shelves) above the list in the same scroll.
export function DiscoveryList({
  query,
  onPressItem,
  ListHeaderComponent,
  emptyText = 'Nothing here yet.',
  contentContainerStyle,
  enableAddToTrip = false,
  lazyShelves = false,
}) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const { height: winH } = useWindowDimensions();
  const [tripTarget, setTripTarget] = useState(null); // venue/event to add via the sheet
  // Reveal lines for lazy header shelves (both monotonic): mountY leads by a buffer so covers
  // preload off-screen; showY is the true viewport bottom so entrance fades play on real entry.
  const [reveal, setReveal] = useState({ mountY: winH + REVEAL_BUFFER, showY: winH });
  const onReveal = useCallback((e) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const vp = contentOffset.y + layoutMeasurement.height;
    const mountY = Math.ceil((vp + REVEAL_BUFFER) / REVEAL_STEP) * REVEAL_STEP;
    const showY = Math.ceil(vp / REVEAL_STEP) * REVEAL_STEP;
    setReveal((prev) => (
      mountY > prev.mountY || showY > prev.showY
        ? { mountY: Math.max(prev.mountY, mountY), showY: Math.max(prev.showY, showY) }
        : prev
    ));
  }, []);
  const {
    items, isLoading, isError, error, refetch, isRefetching,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useDiscovery(query);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }) => (
      <ExperienceCard
        item={item}
        onPress={() => onPressItem?.(item)}
        onAddToTrip={enableAddToTrip ? setTripTarget : undefined}
      />
    ),
    [onPressItem, enableAddToTrip],
  );

  const footer = isFetchingNextPage ? (
    <ActivityIndicator style={styles.footer} color={colors.textLo} />
  ) : null;

  const empty = isLoading ? (
    <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
  ) : isError ? (
    <View style={styles.center}>
      <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error?.message ?? 'Could not load experiences.'}</AppText>
      <Button label="Retry" variant="secondary" full={false} onPress={() => refetch()} />
    </View>
  ) : (
    <View style={styles.center}><AppText variant="body" color={colors.textLo} style={styles.centerText}>{emptyText}</AppText></View>
  );

  return (
    <ShelfRevealContext.Provider value={lazyShelves ? reveal : { mountY: Infinity, showY: Infinity }}>
      <FlatList
        data={items}
        keyExtractor={(it) => `${it.kind}-${it.id}`}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        refreshing={isRefetching}
        onRefresh={refetch}
        {...(lazyShelves ? { onScroll: onReveal, scrollEventThrottle: 32 } : {})}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        style={styles.list}
      />
      {enableAddToTrip && (
        <AddToTripSheet
          visible={!!tripTarget}
          onClose={() => setTripTarget(null)}
          userId={userId}
          venue={tripTarget ? { id: tripTarget.id, name: tripTarget.title, kind: tripTarget.kind } : null}
        />
      )}
    </ShelfRevealContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  // Vertical padding only — cards own their horizontal margin, so header shelves
  // can bleed edge-to-edge without fighting a shared horizontal inset.
  content: { paddingVertical: space.sm },
  center: { paddingVertical: space.huge, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  footer: { paddingVertical: space.lg },
});
