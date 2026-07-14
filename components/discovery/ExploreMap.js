import React, { useMemo, useRef, useState } from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { AppText, colors, space, radius } from '../../lib/theme';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { Icon } from '../ui/Icon';
import { darkMapStyle } from './mapStyle';

// react-native-maps has NO Expo Go support (the native view is not bundled), so
// importing/rendering it there crashes. We therefore load it only OUTSIDE Expo Go,
// via a guarded require, and fall back to a friendly panel in Expo Go. This keeps the
// standard `npx expo start` (Expo Go) workflow crash-free; the real map lights up
// automatically in a custom dev build. No PROVIDER_GOOGLE — the default provider
// (Apple Maps on iOS / Google on Android) avoids the Google-only key requirement.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

let MapView = null;
let Marker = null;
if (!IS_EXPO_GO) {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default ?? Maps.MapView ?? null;
    Marker = Maps.Marker ?? null;
  } catch {
    MapView = null; // native module absent — degrade to the fallback
  }
}
const MAPS_AVAILABLE = !!MapView && !!Marker;

// Shown wherever the native map can't run (Expo Go). Keeps the surface useful — it
// reflects how many places are around and points back to the working List view.
function MapFallback({ count }) {
  return (
    <View style={styles.fallback}>
      <Icon name="pin" size={30} color={colors.textLo} />
      <AppText variant="title" style={styles.fallbackTitle}>Map view needs the full app</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.fallbackBody}>
        The interactive map runs in the installed app build, not Expo Go.
        {count ? ` There ${count === 1 ? 'is' : 'are'} ${count} place${count === 1 ? '' : 's'} nearby — switch to List to explore them.` : ' Switch to List to explore what’s nearby.'}
      </AppText>
    </View>
  );
}

// The interactive exploration map. Renders the (coordinate-bearing) items as
// category-tinted pins; tapping a pin raises a compact card that opens the listing.
// Presentational only — takes items + center, never fetches.
export function ExploreMap({ items, center, radiusM = 5000, onOpenItem }) {
  const mapRef = useRef(null);
  const [selected, setSelected] = useState(null);

  const region = useMemo(() => {
    const delta = Math.max((radiusM / 111000) * 2.4, 0.02);
    return { latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta };
  }, [center, radiusM]);

  const pins = useMemo(
    () => (items ?? []).filter((it) => it.latitude != null && it.longitude != null),
    [items],
  );

  if (!MAPS_AVAILABLE) return <MapFallback count={pins.length} />;

  const recenter = () => mapRef.current?.animateToRegion(region, 350);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        customMapStyle={darkMapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelected(null)}
      >
        {pins.map((it) => (
          <Marker
            key={`${it.kind}-${it.id}`}
            coordinate={{ latitude: it.latitude, longitude: it.longitude }}
            pinColor={CATEGORY_COLORS[it.category] ?? CATEGORY_COLORS.other}
            onPress={(e) => { e.stopPropagation?.(); setSelected(it); }}
          />
        ))}
      </MapView>

      <Pressable style={styles.recenter} onPress={recenter} hitSlop={8} accessibilityLabel="Recenter">
        <Icon name="pin" size={20} color={colors.textHi} />
      </Pressable>

      {selected && (
        <Pressable style={styles.card} onPress={() => onOpenItem?.(selected)}>
          {selected.imageUrl ? (
            <Image source={{ uri: selected.imageUrl }} style={styles.cardImg} />
          ) : (
            <View style={[styles.cardImg, { backgroundColor: CATEGORY_COLORS[selected.category] ?? CATEGORY_COLORS.other }]} />
          )}
          <View style={styles.cardBody}>
            <AppText variant="bodySemi" numberOfLines={1}>{selected.title}</AppText>
            <AppText variant="label" color={colors.textLo} numberOfLines={1}>
              {categoryLabel(selected.category) ?? ''}
              {selected.distanceM != null ? ` · ${(selected.distanceM / 1000).toFixed(1)} km` : ''}
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color={colors.textMute} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, gap: space.sm },
  fallbackTitle: { textAlign: 'center', marginTop: space.xs },
  fallbackBody: { textAlign: 'center', lineHeight: 21 },
  recenter: { position: 'absolute', right: space.base, bottom: space.base + 92, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', left: space.base, right: space.base, bottom: space.base, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.sm, paddingRight: space.md },
  cardImg: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.bgBase },
  cardBody: { flex: 1, gap: 2 },
});
