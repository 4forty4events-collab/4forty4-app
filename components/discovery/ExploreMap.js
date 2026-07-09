import React, { useMemo, useRef, useState } from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { AppText, colors, space, radius } from '../../lib/theme';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { Icon } from '../ui/Icon';
import { darkMapStyle } from './mapStyle';

// The interactive exploration map. Renders the (coordinate-bearing) items as
// category-tinted pins over a custom dark Google map; tapping a pin raises a compact
// card that opens the listing. A recenter button snaps back to the search area.
// Presentational only — it takes items + center, never fetches; NearbyScreen owns
// the query so the list and map share one cache.
export function ExploreMap({ items, center, radiusM = 5000, onOpenItem }) {
  const mapRef = useRef(null);
  const [selected, setSelected] = useState(null);

  const region = useMemo(() => {
    // Rough degrees spanned by the radius, padded so the whole circle is visible.
    const delta = Math.max((radiusM / 111000) * 2.4, 0.02);
    return { latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta };
  }, [center, radiusM]);

  const pins = useMemo(
    () => (items ?? []).filter((it) => it.latitude != null && it.longitude != null),
    [items],
  );

  const recenter = () => mapRef.current?.animateToRegion(region, 350);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
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
  recenter: { position: 'absolute', right: space.base, bottom: space.base + 92, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', left: space.base, right: space.base, bottom: space.base, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.sm, paddingRight: space.md },
  cardImg: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.bgBase },
  cardBody: { flex: 1, gap: 2 },
});
