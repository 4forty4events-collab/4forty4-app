import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useSession } from '../providers/SessionProvider';
import { useLocation } from '../providers/LocationProvider';
import { CATEGORY_COLORS, categoryLabel } from '../lib/categories';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { useCategoryFacets } from '../lib/discovery/hooks/useCategoryFacets';
import { DiscoveryList } from '../components/discovery/DiscoveryList';
import { Shelf } from '../components/discovery/Shelf';
import { ForYouShelf } from '../components/discovery/ForYouShelf';
import { InlineDrop } from '../components/discovery/InlineDrop';
import { BlueprintShelf } from '../components/coordination/BlueprintShelf';
import { RadarTeaserCard } from '../components/radar/RadarTeaserCard';
import { RadarUpsellModal } from '../components/radar/RadarUpsellModal';
import { MerchPromoCard } from '../components/merch/MerchPromoCard';
import { getSeason } from '../lib/discovery/seasons';
import { useUnreadCount } from '../lib/notifications/hooks';
import { AppText, colors, space, radius } from '../lib/theme';
import { Chip } from '../components/ui/Chip';
import { Icon } from '../components/ui/Icon';

const ADMIN_LINKS = [
  ['Add listing', 'ParseListingTest'],
  ['Import', 'ImportPlaces'],
  ['Inbox', 'Inbox'],
  ['Manage', 'Manage'],
  ['Drops', 'CreateDrop'],
  ['Merch', 'MerchManager'],
  ['Orders', 'MerchOrders'],
  ['Seed', 'SeedVenues'],
  ['Harvest', 'Harvest'],
  ['Ingest Reel', 'AdminIngest'],
];

// Discover: the DEFAULT Explore surface — the curated, shelf-based view (For You /
// Nearby / Trending / Recently viewed / Editor's Picks / Blueprints) plus a real-data
// category rail and the admin bar. This is orientation: shelves load first. The
// signature full-bleed image feed is the immerse-on-demand mode, reached via the
// "Feed" pill. Same DiscoveryQuery pipeline throughout.
export default function BrowseShelvesScreen({ navigation }) {
  const { market } = useMarket();
  const { session, profile } = useSession();
  const { coords } = useLocation();
  const { data: unread = 0 } = useUnreadCount(session?.user?.id ?? null);
  const { data: facets = [] } = useCategoryFacets(market);
  const [category, setCategory] = useState('all');
  const [radarOpen, setRadarOpen] = useState(false);

  const marketLabel = market === 'ZW' ? 'Zimbabwe' : 'Algeria';
  const onPressItem = useCallback(
    (item) => navigation.navigate('ListingDetail', { item }),
    [navigation],
  );

  const mainQuery = useMemo(
    () => discoveryService.feed({ market, categories: category === 'all' ? null : [category] }),
    [market, category],
  );
  const nearbyQuery = useMemo(() => discoveryService.nearby({ market, near: coords }), [market, coords]);
  const trendingQuery = useMemo(() => discoveryService.trending({ market }), [market]);
  const newestQuery = useMemo(() => discoveryService.newest({ market }), [market]);
  const weekendQuery = useMemo(() => discoveryService.weekend({ market }), [market]);
  const editorsQuery = useMemo(() => discoveryService.editorsPicks({ market }), [market]);
  const topRatedQuery = useMemo(() => discoveryService.topRated({ market }), [market]);
  const gemsQuery = useMemo(() => discoveryService.hiddenGems({ market }), [market]);
  const season = useMemo(() => getSeason(market), [market]);
  const seasonalQuery = useMemo(
    () => discoveryService.seasonal({ market, categories: season.categories }),
    [market, season],
  );

  // The flagship "Plan my outing" CTA. Lives INSIDE the scrolling list header so it scrolls
  // away with the feed (no permanently pinned strip). Its tap is reliable now that the
  // shelves auto-advance idle-between-steps instead of scrolling every frame — the header no
  // longer reflows under the finger, so the vertical list no longer mistakes the press for a
  // scroll and cancels it.
  const architectBanner = (
    <TouchableOpacity style={styles.architectBanner} onPress={() => navigation.navigate('Architect')} activeOpacity={0.85}>
      <View style={styles.architectIcon}><Icon name="spark" size={22} color={colors.onAccent} fill /></View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodySemi" color={colors.textHi}>Plan my outing</AppText>
        <AppText variant="label" color={colors.textLo}>Tell us the vibe — we build a real day out around you.</AppText>
      </View>
      <Icon name="chevronRight" size={20} color={colors.textMute} />
    </TouchableOpacity>
  );

  const listHeader = category === 'all' ? (
    <View style={styles.shelves}>
      {architectBanner}

      {/* Row 1 — The Daily Pulse: tonight's live/upcoming events, horizontally. */}
      <Shelf
        title="The Daily Pulse"
        subtitle="Happening tonight"
        query={weekendQuery}
        onPressItem={onPressItem}
        onSeeAll={() => navigation.navigate('DailyPulse')}
      />

      {/* Row 2 — THE 4FORTY4 DROP: full-width, self-animating, self-subscribing centerpiece. */}
      <InlineDrop market={market} />

      {/* Row 3 — Premium Curated Spaces: elite fixed venues (lounges, premium spots). */}
      <Shelf title="Premium Curated Spaces" subtitle="Elite lounges & venues" query={topRatedQuery} onPressItem={onPressItem} />

      {/* Official merch advert — renders only when the admin has promoted a product. */}
      <MerchPromoCard market={market} onPress={() => navigation.navigate('Merch')} />

      {session && (
        <ForYouShelf userId={session.user.id} market={market} coords={coords} onPressItem={onPressItem} />
      )}
      {coords && (
        <Shelf
          title="Nearby"
          subtitle="Closest to you"
          query={nearbyQuery}
          onPressItem={onPressItem}
          onSeeAll={() => navigation.navigate('Nearby')}
        />
      )}
      <Shelf title="Editor's Picks" subtitle="Hand-picked for you" query={editorsQuery} fallbackQuery={topRatedQuery} onPressItem={onPressItem} />

      {/* Editorial interstitial — the Radar flagship advert dividing major sections. */}
      <RadarTeaserCard onPress={() => setRadarOpen(true)} />

      <Shelf title="Trending" subtitle="Popular right now" query={trendingQuery} onPressItem={onPressItem} />
      <Shelf title="Hidden gems" subtitle="Underrated, highly rated" query={gemsQuery} onPressItem={onPressItem} />
      <Shelf title={season.label} subtitle={season.subtitle} query={seasonalQuery} onPressItem={onPressItem} />
      <Shelf title="New arrivals" subtitle="Just added" query={newestQuery} onPressItem={onPressItem} />
      <BlueprintShelf navigation={navigation} />
      <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>ALL EXPERIENCES</AppText>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.topBar}>
          <AppText variant="heading">Discover</AppText>
          <View style={styles.topPills}>
            <TouchableOpacity
              style={styles.feedPill}
              onPress={() => navigation.navigate('DailyPulse')}
              activeOpacity={0.8}
              accessibilityLabel="Open The Daily Pulse — tonight's events"
            >
              <Icon name="calendar" size={16} color={colors.accent} />
              <AppText variant="label" color={colors.textHi}>Tonight</AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.feedPill}
              onPress={() => navigation.navigate('Feed', { category })}
              activeOpacity={0.8}
              accessibilityLabel="Open the full-screen photo feed"
            >
              <Icon name="image" size={16} color={colors.textHi} />
              <AppText variant="label" color={colors.textHi}>Feed</AppText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.searchBox} onPress={() => navigation.navigate('Search')} activeOpacity={0.7}>
            <Icon name="search" size={17} color={colors.textMute} />
            <AppText variant="body" color={colors.textMute}>Search places, events, cafés…</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Nearby')} activeOpacity={0.7}>
            <Icon name="pin" size={19} color={colors.textHi} />
          </TouchableOpacity>
          {session && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')} activeOpacity={0.7}>
              <Icon name="bell" size={19} color={colors.textHi} />
              {unread > 0 && (
                <View style={styles.badge}>
                  <AppText variant="caption" color="#fff">{unread > 99 ? '99+' : unread}</AppText>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {session && profile?.is_admin && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminBar} contentContainerStyle={styles.adminBarContent}>
            {ADMIN_LINKS.map(([label, screen]) => (
              <TouchableOpacity key={screen} style={styles.adminChip} onPress={() => navigation.navigate(screen)}>
                <AppText variant="label" color={colors.textLo}>{label}</AppText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.railWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipScrollContent}>
          <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
          {facets.map(({ category: c }) => (
            <Chip
              key={c}
              label={categoryLabel(c)}
              tint={CATEGORY_COLORS[c]}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </ScrollView>
      </View>

      <DiscoveryList
        query={mainQuery}
        onPressItem={onPressItem}
        ListHeaderComponent={listHeader}
        enableAddToTrip
        emptyText={category !== 'all' ? `Nothing in ${category} yet` : `No experiences yet in ${marketLabel}`}
      />

      <RadarUpsellModal visible={radarOpen} onClose={() => setRadarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  header: { paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  topPills: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  feedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  searchRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  searchIcon: { fontSize: 15 },
  iconBtn: { width: 46, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 20 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  adminBar: { marginHorizontal: -space.base, flexGrow: 0, height: 36 },
  adminBarContent: { paddingHorizontal: space.base, gap: space.sm, alignItems: 'center' },
  adminChip: { paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  railWrap: { height: 44, marginBottom: space.xs },
  chipScroll: { flexGrow: 0 },
  chipScrollContent: { paddingHorizontal: space.base, paddingVertical: 6, gap: space.sm, alignItems: 'center' },
  shelves: { marginTop: space.xs },
  architectBanner: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.base, marginBottom: space.lg, padding: space.base, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent2, backgroundColor: colors.bgElevated },
  architectIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { paddingHorizontal: space.base, marginTop: space.xs, marginBottom: space.xs },
});
