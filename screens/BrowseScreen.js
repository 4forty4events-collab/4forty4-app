import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Animated, ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useSession } from '../providers/SessionProvider';
import { useLocation } from '../providers/LocationProvider';
import { CATEGORY_COLORS, categoryLabel } from '../lib/categories';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { useDiscovery } from '../lib/discovery/hooks/useDiscovery';
import { useCategoryFacets } from '../lib/discovery/hooks/useCategoryFacets';
import { isListingSaved, addSave, removeSave } from '../lib/saves';
import { AddToTripSheet } from '../components/coordination/AddToTripSheet';
import { FeedItem } from '../components/discovery/FeedItem';
import { AppText, colors, space, radius, useReducedMotion } from '../lib/theme';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

const AnimatedFlatList = Animated.FlatList;

// Feed — the signature full-bleed mode, immerse-on-demand. Each venue/event fills
// the screen with its real R2 photo; a bottom scrim carries name / description /
// rating / save + add-to-trip. Reached from the "Feed" pill on Discover, so it opens
// on the same category the user was browsing (route.params.category). Same
// DiscoveryQuery pipeline (discoveryService.feed + useDiscovery); shelves live on
// the Discover tab.
export default function BrowseScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { market } = useMarket();
  const { session } = useSession();
  const { coords } = useLocation();
  const userId = session?.user?.id ?? null;

  const { data: facets = [] } = useCategoryFacets(market);
  const [category, setCategory] = useState(route?.params?.category ?? 'all');
  const [listHeight, setListHeight] = useState(0);
  const [tripTarget, setTripTarget] = useState(null);
  const [savedMap, setSavedMap] = useState({}); // `${kind}-${id}` -> bool
  const scrollY = useRef(new Animated.Value(0)).current;

  const query = useMemo(
    () => discoveryService.feed({ market, categories: category === 'all' ? null : [category] }),
    [market, category],
  );
  const { items, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useDiscovery(query);

  const onOpen = useCallback((item) => navigation.navigate('ListingDetail', { item }), [navigation]);

  // Save toggles optimistically and calls the existing endpoint; double-tap forces
  // save. Guests are routed to sign-in (app-wide pattern). No new query added.
  const onRequestSave = useCallback((item, next) => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    const key = `${item.kind}-${item.id}`;
    setSavedMap((m) => ({ ...m, [key]: next }));
    const op = next ? addSave(userId, item.kind, item.id) : removeSave(userId, item.kind, item.id);
    op.catch(() => setSavedMap((m) => ({ ...m, [key]: !next })));
  }, [userId, navigation]);

  // Sync the heart of the item that scrolls into view (once, lazily) using the
  // existing read helper — cheap, one call per newly-seen page.
  const onViewRef = useRef(({ viewableItems }) => {
    const vi = viewableItems?.[0]?.item;
    if (!vi || !userId) return;
    const key = `${vi.kind}-${vi.id}`;
    setSavedMap((m) => {
      if (key in m) return m;
      isListingSaved(userId, vi.kind, vi.id)
        .then((s) => setSavedMap((mm) => (key in mm && mm[key] !== s ? mm : { ...mm, [key]: s })))
        .catch(() => {});
      return { ...m, [key]: false };
    });
  });
  const viewCfgRef = useRef({ itemVisiblePercentThreshold: 80 });

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(({ item, index }) => (
    <FeedItem
      item={item}
      index={index}
      scrollY={scrollY}
      itemHeight={listHeight}
      topInset={insets.top}
      bottomInset={Math.max(insets.bottom, space.base)}
      saved={!!savedMap[`${item.kind}-${item.id}`]}
      onRequestSave={onRequestSave}
      onOpen={onOpen}
      onAddToTrip={setTripTarget}
      reducedMotion={reducedMotion}
    />
  ), [scrollY, listHeight, insets.top, insets.bottom, savedMap, onRequestSave, onOpen, reducedMotion]);

  const getItemLayout = useCallback((_d, index) => ({ length: listHeight, offset: listHeight * index, index }), [listHeight]);

  return (
    <View style={styles.container} onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
      {listHeight > 0 && (
        isLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
        ) : isError ? (
          <View style={styles.center}>
            <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error?.message ?? 'Could not load experiences.'}</AppText>
            <Button label="Retry" variant="secondary" full={false} onPress={() => refetch()} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <AppText variant="heading" style={styles.centerText}>Nothing here yet</AppText>
            <AppText variant="body" color={colors.textLo} style={styles.centerText}>
              {category !== 'all' ? `No ${category} in this area yet.` : 'Check back soon.'}
            </AppText>
          </View>
        ) : (
          <AnimatedFlatList
            data={items}
            style={styles.list}
            keyExtractor={(it) => `${it.kind}-${it.id}`}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewRef.current}
            viewabilityConfig={viewCfgRef.current}
            onEndReached={onEndReached}
            onEndReachedThreshold={1.2}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.textLo} /> : null}
            windowSize={3}
            maxToRenderPerBatch={3}
            initialNumToRender={2}
          />
        )
      )}

      {/* Floating top controls over the photo */}
      <View style={[styles.topBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <Pressable style={styles.glassBtn} onPress={() => navigation.goBack()} hitSlop={6} accessibilityLabel="Back to Discover">
          <Icon name="grid" size={17} color={colors.textHi} />
          <AppText variant="label" color={colors.textHi}>Browse</AppText>
        </Pressable>
        <View style={styles.topRight} pointerEvents="box-none">
          <Pressable style={styles.glassRound} onPress={() => navigation.navigate('Search')} hitSlop={6} accessibilityLabel="Search">
            <Icon name="search" size={19} color={colors.textHi} />
          </Pressable>
          {session ? (
            <Pressable style={styles.glassRound} onPress={() => navigation.navigate('Notifications')} hitSlop={6} accessibilityLabel="Notifications">
              <Icon name="bell" size={19} color={colors.textHi} />
            </Pressable>
          ) : (
            <Pressable style={styles.glassRound} onPress={() => navigation.navigate('SignIn')} hitSlop={6}>
              <AppText variant="label" color={colors.textHi}>Sign in</AppText>
            </Pressable>
          )}
        </View>
      </View>

      {/* Slim category rail (explicit height + padded content — avoids the chip clip bug) */}
      <View style={[styles.railWrap, { top: insets.top + 58 }]} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
          <Chip label="All" floating selected={category === 'all'} onPress={() => setCategory('all')} style={styles.railChip} />
          {facets.map(({ category: c }) => (
            <Chip key={c} label={categoryLabel(c)} tint={CATEGORY_COLORS[c]} floating selected={category === c} onPress={() => setCategory(c)} style={styles.railChip} />
          ))}
        </ScrollView>
      </View>

      <AddToTripSheet
        visible={!!tripTarget}
        onClose={() => setTripTarget(null)}
        userId={userId}
        venue={tripTarget ? { id: tripTarget.id, name: tripTarget.title, kind: tripTarget.kind } : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  list: { flex: 1 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  footer: { paddingVertical: space.lg },
  topBar: { position: 'absolute', left: space.base, right: space.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  glassBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  glassRound: { minWidth: 40, height: 40, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  glassIcon: { fontSize: 16 },
  railWrap: { position: 'absolute', left: 0, right: 0, height: 40 },
  rail: { flexGrow: 0 },
  railContent: { paddingHorizontal: space.base, gap: space.sm, alignItems: 'center' },
  railChip: { marginRight: 0 },
});
