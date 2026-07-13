import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useSession } from '../providers/SessionProvider';
import { useLocation } from '../providers/LocationProvider';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { DiscoveryList } from '../components/discovery/DiscoveryList';
import { LazyShelf } from '../components/discovery/LazyShelf';
import { Shelf } from '../components/discovery/Shelf';
import { FeaturedHero } from '../components/discovery/FeaturedHero';
import { AiPicksShelf } from '../components/discovery/AiPicksShelf';
import { VibeCollections } from '../components/discovery/VibeCollections';
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

// City label per market — the location line reads "City, Country" (tap → Settings, where
// the market is actually changed). Kept simple; a finer geo label can come from coords later.
const PLACE = { ZW: 'Harare, Zimbabwe', DZ: 'Algiers, Algeria' };

function greetingFor(session) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const meta = session?.user?.user_metadata ?? {};
  const name = String(meta.full_name || meta.name || meta.given_name || '').trim().split(/\s+/)[0] || '';
  return `Good ${part}${name ? `, ${name}` : ''}`;
}

// Discover — "the home screen for going out". A hero header (greeting, search, quick
// filters, quick actions, Featured Today) over the curated shelf stack. Motion is used
// sparingly: only Featured Today auto-advances; every row below is a static swipe row.
export default function BrowseShelvesScreen({ navigation }) {
  const { market } = useMarket();
  const { session, profile } = useSession();
  const { coords } = useLocation();
  const { data: unread = 0 } = useUnreadCount(session?.user?.id ?? null);
  const [radarOpen, setRadarOpen] = useState(false);

  const isAdmin = !!(session && profile?.is_admin);
  const marketLabel = market === 'ZW' ? 'Zimbabwe' : 'Algeria';
  const onPressItem = useCallback(
    (item) => navigation.navigate('ListingDetail', { item }),
    [navigation],
  );

  const mainQuery = useMemo(() => discoveryService.feed({ market, categories: null }), [market]);
  const nearbyQuery = useMemo(() => discoveryService.nearby({ market, near: coords }), [market, coords]);
  const trendingQuery = useMemo(() => discoveryService.trending({ market }), [market]);
  const newestQuery = useMemo(() => discoveryService.newest({ market }), [market]);
  const weekendQuery = useMemo(() => discoveryService.weekend({ market }), [market]);
  const featuredQuery = useMemo(() => discoveryService.featured({ market }), [market]);
  const topRatedQuery = useMemo(() => discoveryService.topRated({ market }), [market]);
  const gemsQuery = useMemo(() => discoveryService.hiddenGems({ market }), [market]);
  const season = useMemo(() => getSeason(market), [market]);
  const seasonalQuery = useMemo(
    () => discoveryService.seasonal({ market, categories: season.categories }),
    [market, season],
  );

  // User-facing shortcuts. Admin gets Add Place; everyone else gets Saved in that slot.
  const quickActions = [
    isAdmin
      ? { icon: 'plus', label: 'Add Place', onPress: () => navigation.navigate('ParseListingTest') }
      : { icon: 'bookmark', label: 'Saved', onPress: () => navigation.navigate('SavedTab') },
    { icon: 'spark', label: 'AI Planner', onPress: () => navigation.navigate('Architect') },
    { icon: 'calendar', label: 'Events', onPress: () => navigation.navigate('DailyPulse') },
    { icon: 'pin', label: 'Map', onPress: () => navigation.navigate('MapTab') },
  ];

  const listHeader = (
    <View style={styles.hero}>
      {/* Top bar — location (→ Settings) + notifications. */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.locBtn} onPress={() => navigation.navigate('Settings')} activeOpacity={0.7} accessibilityLabel="Change location">
          <Icon name="pin" size={16} color={colors.textLo} />
          <AppText variant="label" color={colors.textHi}>{PLACE[market] ?? PLACE.DZ}</AppText>
          <Icon name="chevronDown" size={15} color={colors.textLo} />
        </TouchableOpacity>
        {session && (
          <TouchableOpacity style={styles.bellBtn} onPress={() => navigation.navigate('Notifications')} activeOpacity={0.7} accessibilityLabel="Notifications">
            <Icon name="bell" size={20} color={colors.textHi} />
            {unread > 0 && (
              <View style={styles.badge}><AppText variant="caption" color="#fff">{unread > 99 ? '99+' : unread}</AppText></View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Greeting + the AI shortcut. */}
      <View style={styles.greetRow}>
        <View style={styles.greetText}>
          <AppText variant="display" style={styles.greeting}>{greetingFor(session)} 👋</AppText>
          <AppText variant="body" color={colors.textLo}>Where are we going tonight?</AppText>
        </View>
        <TouchableOpacity style={styles.aiPill} onPress={() => navigation.navigate('Architect')} activeOpacity={0.85}>
          <Icon name="spark" size={15} color={colors.accent} fill />
          <AppText variant="label" color={colors.accent}>AI Picks</AppText>
        </TouchableOpacity>
      </View>

      {/* Search. */}
      <View style={styles.searchRow}>
        <TouchableOpacity style={styles.searchBox} onPress={() => navigation.navigate('Search')} activeOpacity={0.7}>
          <Icon name="search" size={17} color={colors.textMute} />
          <AppText variant="body" color={colors.textMute}>Search places, events, cafés…</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search')} activeOpacity={0.7} accessibilityLabel="Filters">
          <Icon name="settings" size={19} color={colors.textHi} />
        </TouchableOpacity>
      </View>

      {/* Quick filters. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipScrollContent}>
        <Chip label="📍 Near Me" onPress={() => navigation.navigate('Nearby')} />
        <Chip label="📅 Tonight" onPress={() => navigation.navigate('DailyPulse')} />
        <Chip label="🔥 Trending" onPress={() => navigation.navigate('Feed')} />
        <Chip label="❤️ For You" onPress={() => navigation.navigate('Feed')} />
      </ScrollView>

      {/* Quick actions. */}
      <View style={styles.quickRow}>
        {quickActions.map((qa) => (
          <TouchableOpacity key={qa.label} style={styles.quickCard} onPress={qa.onPress} activeOpacity={0.85}>
            <Icon name={qa.icon} size={23} color={colors.accent} />
            <AppText variant="label" color={colors.textHi} style={styles.quickLabel}>{qa.label}</AppText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Admin tools (admins only) — kept out of the way, not stranded. */}
      {isAdmin && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminBar} contentContainerStyle={styles.adminBarContent}>
          {ADMIN_LINKS.map(([label, screen]) => (
            <TouchableOpacity key={screen} style={styles.adminChip} onPress={() => navigation.navigate(screen)}>
              <AppText variant="label" color={colors.textLo}>{label}</AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Featured Today — the one auto-advancing element on the screen. */}
      <View style={styles.sectionHead}>
        <AppText variant="title" style={styles.sectionTitle}>Featured Today</AppText>
        <TouchableOpacity onPress={() => navigation.navigate('Feed')} hitSlop={8}>
          <AppText variant="label" color={colors.accent2}>See all</AppText>
        </TouchableOpacity>
      </View>
      <FeaturedHero query={featuredQuery} fallbackQuery={topRatedQuery} onPressItem={onPressItem} />

      {/* Curated shelves. Only Daily Pulse mounts eagerly; the rest lazy-mount near the fold. */}
      <View style={styles.shelves}>
        <Shelf
          title="The Daily Pulse"
          subtitle="Happening tonight"
          query={weekendQuery}
          onPressItem={onPressItem}
          onSeeAll={() => navigation.navigate('DailyPulse')}
        />

        <LazyShelf estHeight={260}><InlineDrop market={market} /></LazyShelf>
        <LazyShelf><Shelf title="Premium Curated Spaces" subtitle="Elite lounges & venues" query={topRatedQuery} onPressItem={onPressItem} /></LazyShelf>
        <LazyShelf estHeight={220}><MerchPromoCard market={market} onPress={() => navigation.navigate('Merch')} /></LazyShelf>

        {session && (
          <LazyShelf><AiPicksShelf userId={session.user.id} market={market} coords={coords} onPressItem={onPressItem} /></LazyShelf>
        )}
        {coords && (
          <LazyShelf>
            <Shelf title="Around You" subtitle="A short walk away" query={nearbyQuery} onPressItem={onPressItem} onSeeAll={() => navigation.navigate('Nearby')} />
          </LazyShelf>
        )}

        {/* Trending — tall Netflix-style posters. */}
        <LazyShelf estHeight={320}><Shelf title="Trending This Weekend" subtitle="Popular right now" query={trendingQuery} variant="poster" onPressItem={onPressItem} /></LazyShelf>

        <LazyShelf estHeight={160}><RadarTeaserCard onPress={() => setRadarOpen(true)} /></LazyShelf>

        <LazyShelf><Shelf title="Hidden gems" subtitle="Underrated, highly rated" query={gemsQuery} onPressItem={onPressItem} /></LazyShelf>
        <LazyShelf><Shelf title={season.label} subtitle={season.subtitle} query={seasonalQuery} onPressItem={onPressItem} /></LazyShelf>

        {/* Recently Added — compact cards with a NEW badge. */}
        <LazyShelf estHeight={240}><Shelf title="Recently Added" subtitle="Just added" query={newestQuery} variant="new" onPressItem={onPressItem} /></LazyShelf>

        {/* Explore by Vibe — mood collections replacing the old category rail. */}
        <LazyShelf estHeight={150}>
          <View style={styles.vibeWrap}>
            <View style={styles.sectionHead}>
              <AppText variant="title" style={styles.sectionTitle}>Explore by Vibe</AppText>
            </View>
            <VibeCollections onPick={(category) => navigation.navigate('Feed', { category })} />
          </View>
        </LazyShelf>

        <LazyShelf estHeight={220}><BlueprintShelf navigation={navigation} /></LazyShelf>
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>ALL EXPERIENCES</AppText>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <DiscoveryList
        query={mainQuery}
        onPressItem={onPressItem}
        ListHeaderComponent={listHeader}
        enableAddToTrip
        lazyShelves
        emptyText={`No experiences yet in ${marketLabel}`}
      />
      <RadarUpsellModal visible={radarOpen} onClose={() => setRadarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  hero: { paddingTop: space.sm },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, marginBottom: space.md },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bellBtn: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },

  greetRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, paddingHorizontal: space.base, marginBottom: space.base },
  greetText: { flex: 1 },
  greeting: { fontSize: 30, lineHeight: 36, marginBottom: 2 },
  aiPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },

  searchRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.base, marginBottom: space.md },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  iconBtn: { width: 48, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  chipScroll: { flexGrow: 0, marginBottom: space.md },
  chipScrollContent: { paddingHorizontal: space.base, gap: space.sm, alignItems: 'center' },

  quickRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.base, marginBottom: space.lg },
  quickCard: { flex: 1, height: 84, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 8 },
  quickLabel: { textAlign: 'center' },

  adminBar: { flexGrow: 0, height: 36, marginBottom: space.md },
  adminBarContent: { paddingHorizontal: space.base, gap: space.sm, alignItems: 'center' },
  adminChip: { paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, marginBottom: space.sm },
  sectionTitle: { fontSize: 20 },
  vibeWrap: { marginBottom: space.lg },

  shelves: { marginTop: space.lg },
  sectionLabel: { paddingHorizontal: space.base, marginTop: space.xs, marginBottom: space.xs },
});
