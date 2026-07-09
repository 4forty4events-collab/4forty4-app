import React from 'react';
import { View, Image, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { CATEGORY_COLORS } from '../../lib/categories';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Icon } from '../ui/Icon';

// The canonical discovery card (dark). Renders any FeedItem (venue or event) and
// adds the discovery-era signals: distance (from PostGIS) and rating (from Google).
// Two layouts from one component: full-width in a vertical list, or a fixed-width
// tile inside a horizontal Shelf (pass `width`). Presentation only.
const MARKET_UTC_OFFSET_HOURS = { DZ: 1, ZW: 2 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatEventDate(iso, market) {
  const offset = MARKET_UTC_OFFSET_HOURS[market] ?? 0;
  const d = new Date(new Date(iso).getTime() + offset * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${hh}:${mm}`;
}

function formatDistance(m) {
  if (m == null) return null;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// Real price wins over the free tag wins over a note. Free is price=null + 'free'.
function priceLine(item) {
  if (item.kind === 'event') {
    if (item.price != null) return `${item.price} ${item.currency ?? ''}`.trim();
    if (item.tags?.includes('free')) return 'Free';
    if (item.priceNote) return item.priceNote;
    return null;
  }
  if (item.pricePerPerson != null) {
    const cur = item.currency ?? (item.market === 'ZW' ? 'USD' : 'DZD');
    return `${item.priceEstimated ? '≈ ' : ''}${item.pricePerPerson} ${cur}/pp`;
  }
  return null;
}

function ImageBlock({ item, height }) {
  if (item.imageUrl) {
    return <Image source={{ uri: item.imageUrl }} style={[styles.image, { height }]} />;
  }
  const color = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  return (
    <View style={[styles.image, styles.imagePlaceholder, { height, backgroundColor: color }]}>
      <AppText variant="label" color="rgba(255,255,255,0.92)">{item.category ?? 'other'}</AppText>
    </View>
  );
}

export function ExperienceCard({ item, onPress, width, imageHeight, onAddToTrip }) {
  const isEvent = item.kind === 'event';
  const accent = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  const imgH = imageHeight ?? (width ? 120 : 170);
  const price = priceLine(item);
  const distance = formatDistance(item.distanceM);
  const subtitle = isEvent
    ? (item.venueName ? `at ${item.venueName}` : null)
    : [item.city, item.address].filter(Boolean).join(' · ') || null;

  return (
    <TouchableOpacity
      style={[styles.card, width ? { width } : styles.cardFull]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.imageArea, { height: imgH }]}>
        <ImageBlock item={item} height={imgH} />
        {isEvent && item.startTime && (
          <View style={styles.dateBadge}>
            <AppText variant="caption" color={colors.textHi} numberOfLines={1}>{formatEventDate(item.startTime, item.market)}</AppText>
          </View>
        )}
        {distance && (
          <View style={styles.distanceBadge}>
            <AppText variant="caption" color={colors.textHi}>{distance}</AppText>
          </View>
        )}
        <View style={styles.kindPill}>
          <AppText variant="caption" color={colors.textHi}>{isEvent ? 'EVENT' : 'PLACE'}</AppText>
        </View>
        {onAddToTrip && (
          <Pressable style={styles.addTripBtn} onPress={() => onAddToTrip(item)} hitSlop={8}>
            <AppText variant="caption" color={colors.onAccent}>＋ trip</AppText>
          </Pressable>
        )}
      </View>

      <View style={styles.cardBody}>
        <AppText variant="bodySemi" numberOfLines={1}>{item.title}</AppText>
        {subtitle && <AppText variant="label" color={colors.textLo} numberOfLines={1} style={styles.subtitle}>{subtitle}</AppText>}

        <View style={styles.metaRow}>
          {item.category && (
            <View style={[styles.smallChip, { borderColor: accent }]}>
              <AppText variant="caption" color={accent}>{item.category}</AppText>
            </View>
          )}
          {item.rating != null && (
            <View style={styles.rating}>
              <Icon name="star" size={13} fill color={colors.star} strokeWidth={1.3} />
              <AppText variant="num" color={colors.textHi} style={styles.ratingNum}>{Number(item.rating).toFixed(1)}</AppText>
              {item.reviewCount ? <AppText variant="caption" color={colors.textLo}>{` (${item.reviewCount})`}</AppText> : null}
            </View>
          )}
        </View>

        {price && <AppText variant="num" color={colors.accent} style={styles.priceLine}>{price}</AppText>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cardFull: { marginHorizontal: space.base, marginBottom: space.base },
  imageArea: { position: 'relative', backgroundColor: colors.bgElevated2 },
  image: { width: '100%' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  dateBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 8, maxWidth: '80%' },
  distanceBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  addTripBtn: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 10 },
  kindPill: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  cardBody: { padding: space.md },
  subtitle: { marginTop: 2, marginBottom: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  smallChip: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { fontSize: 13 },
  ratingNum: { fontSize: 13 },
  priceLine: { fontSize: 14, marginTop: space.sm },
});
