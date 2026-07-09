import React, { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useLocation } from '../providers/LocationProvider';
import { CATEGORY_COLORS, categoryLabel } from '../lib/categories';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { useDiscovery } from '../lib/discovery/hooks/useDiscovery';
import { useCategoryFacets } from '../lib/discovery/hooks/useCategoryFacets';
import { DiscoveryList } from '../components/discovery/DiscoveryList';
import { ExploreMap } from '../components/discovery/ExploreMap';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

const RADII = [['1 km', 1000], ['5 km', 5000], ['10 km', 10000], ['25 km', 25000]];

// Nearby: everything around the user, closest first (PostGIS distance). Gated on
// location — prompts if we don't have it yet, explains if it's off. Radius +
// category are just more DiscoveryQuery fields on the same pipeline.
export default function NearbyScreen({ navigation }) {
  const { market } = useMarket();
  const { coords, status, request, error } = useLocation();
  const { data: facets = [] } = useCategoryFacets(market);
  const [category, setCategory] = useState('all');
  const [radiusM, setRadiusM] = useState(5000);
  const [view, setView] = useState('list'); // 'list' | 'map'

  const query = useMemo(
    () => discoveryService.nearby({
      market,
      near: coords,
      radiusM,
      categories: category === 'all' ? null : [category],
    }),
    [market, coords, radiusM, category],
  );

  // Map wants a denser single page of pins than the paginated list; same query
  // otherwise, so switching views hits a warm cache.
  const mapQuery = useMemo(
    () => discoveryService.nearby({
      market,
      near: coords,
      radiusM,
      categories: category === 'all' ? null : [category],
      limit: 60,
    }),
    [market, coords, radiusM, category],
  );
  const { items: mapItems } = useDiscovery(mapQuery, { enabled: !!coords && view === 'map' });

  const onPressItem = (item) => navigation.navigate('ListingDetail', { item });

  const TopBar = (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
        <AppText variant="label" color={colors.textHi}>‹ Back</AppText>
      </TouchableOpacity>
      <AppText variant="heading">Nearby</AppText>
      <View style={{ width: 48 }} />
    </View>
  );

  // Location gate: no coordinates yet.
  if (!coords) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {TopBar}
        <View style={styles.gate}>
          <AppText style={styles.gateEmoji}>📍</AppText>
          <AppText variant="title" style={styles.gateTitle}>See what's around you</AppText>
          <AppText variant="body" color={colors.textLo} style={styles.gateBody}>
            Enable location to discover places and events near you, sorted by distance.
          </AppText>
          {status === 'denied' && (
            <AppText variant="label" color={colors.danger} style={styles.gateNote}>
              Location is currently off for this app. Turn it on in your device settings, then tap retry.
            </AppText>
          )}
          {status === 'error' && error ? <AppText variant="label" color={colors.danger} style={styles.gateNote}>{error}</AppText> : null}
          <Button
            label={status === 'denied' ? 'Retry' : 'Enable location'}
            loading={status === 'requesting'}
            onPress={request}
            full={false}
            style={styles.gateButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {TopBar}

      <View style={styles.radiusRow}>
        {RADII.map(([label, m]) => {
          const on = radiusM === m;
          return (
            <TouchableOpacity key={m} style={[styles.radiusChip, on && styles.radiusChipActive]} onPress={() => setRadiusM(m)}>
              <AppText variant="label" color={on ? colors.onAccent : colors.textLo}>{label}</AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.railWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipScrollContent}>
            <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
            {facets.map(({ category: c }) => (
              <Chip key={c} label={categoryLabel(c)} tint={CATEGORY_COLORS[c]} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
        </View>
        <View style={styles.toggle}>
          <TouchableOpacity style={[styles.toggleItem, view === 'list' && styles.toggleItemActive]} onPress={() => setView('list')}>
            <AppText variant="label" color={view === 'list' ? colors.textHi : colors.textLo}>List</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleItem, view === 'map' && styles.toggleItemActive]} onPress={() => setView('map')}>
            <AppText variant="label" color={view === 'map' ? colors.textHi : colors.textLo}>Map</AppText>
          </TouchableOpacity>
        </View>
      </View>

      {view === 'map' ? (
        <ExploreMap items={mapItems} center={coords} radiusM={radiusM} onOpenItem={onPressItem} />
      ) : (
        <DiscoveryList
          query={query}
          onPressItem={onPressItem}
          enableAddToTrip
          emptyText={`Nothing within ${radiusM / 1000} km${category !== 'all' ? ` in ${categoryLabel(category)}` : ''} yet`}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, gap: space.sm },
  gateEmoji: { fontSize: 44, marginBottom: 4 },
  gateTitle: { textAlign: 'center' },
  gateBody: { textAlign: 'center', lineHeight: 22 },
  gateNote: { textAlign: 'center', lineHeight: 19, marginTop: 4 },
  gateButton: { marginTop: space.md, minWidth: 180 },
  radiusRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.base, paddingVertical: 6 },
  radiusChip: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' },
  radiusChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  controlsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  railWrap: { flex: 1, height: 44 },
  chipScroll: { flexGrow: 0 },
  chipScrollContent: { paddingHorizontal: space.base, paddingVertical: 6, gap: space.sm, alignItems: 'center' },
  toggle: { flexDirection: 'row', marginRight: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 3 },
  toggleItem: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
  toggleItemActive: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line },
});
