import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { CATEGORY_COLORS } from '../lib/categories';
import { AppText, colors, space, radius } from '../lib/theme';

// Shared feed card (dark) — used by Saved. Time logic mirrors the feed:
// place-anchored wall clock via fixed market offsets, never device tz.
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

// Fixed precedence: a real price always wins over the free tag, which wins over
// a freeform note. Free is price=null + 'free' tag, never 0.
function priceLine(item) {
  if (item.price != null) return `${item.price} ${item.currency ?? ''}`.trim();
  if (item.tags?.includes('free')) return 'Free';
  if (item.priceNote) return item.priceNote;
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

function CategoryChipSmall({ category }) {
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  return (
    <View style={[styles.smallChip, { borderColor: color }]}>
      <AppText variant="caption" color={color}>{category}</AppText>
    </View>
  );
}

function TagChip({ label }) {
  return (
    <View style={styles.tagChip}>
      <AppText variant="caption" color={colors.textLo}>{label}</AppText>
    </View>
  );
}

function EventCard({ item, imageHeight, onPress }) {
  const price = priceLine(item);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.imageArea, { height: imageHeight }]}>
        <ImageBlock item={item} height={imageHeight} />
        {item.startTime && (
          <View style={styles.dateBadge}>
            <AppText variant="caption" color={colors.textHi}>{formatEventDate(item.startTime, item.market)}</AppText>
          </View>
        )}
        <View style={styles.kindPill}>
          <AppText variant="caption" color={colors.textHi}>EVENT</AppText>
        </View>
      </View>
      <View style={styles.cardBody}>
        <AppText variant="heading" numberOfLines={1}>{item.title}</AppText>
        {item.venueName && <AppText variant="label" color={colors.textLo} style={styles.subtitle}>at {item.venueName}</AppText>}
        <View style={styles.chipRow}>
          {item.category && <CategoryChipSmall category={item.category} />}
          {item.tags.map((tg) => <TagChip key={tg} label={tg} />)}
        </View>
        {price && <AppText variant="num" color={colors.accent} style={styles.priceLine}>{price}</AppText>}
      </View>
    </TouchableOpacity>
  );
}

function VenueCard({ item, imageHeight, onPress }) {
  const location = [item.city, item.address].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.imageArea, { height: imageHeight }]}>
        <ImageBlock item={item} height={imageHeight} />
        <View style={styles.kindPill}>
          <AppText variant="caption" color={colors.textHi}>PLACE</AppText>
        </View>
      </View>
      <View style={styles.cardBody}>
        <AppText variant="heading" numberOfLines={1}>{item.title}</AppText>
        {location && <AppText variant="label" color={colors.textLo} style={styles.subtitle}>{location}</AppText>}
        <View style={styles.chipRow}>
          {item.category && <CategoryChipSmall category={item.category} />}
          {item.tags.map((tg) => <TagChip key={tg} label={tg} />)}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function FeedCard({ item, imageHeight, onPress }) {
  return item.kind === 'event'
    ? <EventCard item={item} imageHeight={imageHeight} onPress={onPress} />
    : <VenueCard item={item} imageHeight={imageHeight} onPress={onPress} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  imageArea: { position: 'relative', backgroundColor: colors.bgElevated2 },
  image: { width: '100%' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  dateBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 8 },
  kindPill: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  cardBody: { padding: space.base },
  subtitle: { marginTop: 2, marginBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  smallChip: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  tagChip: { backgroundColor: colors.bgElevated2, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  priceLine: { fontSize: 14, marginTop: space.sm },
});
