import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UTC_OFFSET = { DZ: 1, ZW: 2 };

function shortDate(iso, market) {
  const d = new Date(new Date(iso).getTime() + (UTC_OFFSET[market] ?? 0) * 3600 * 1000);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// A tall, portrait "poster" card — the Netflix/Trending treatment. Full-bleed image with a
// category tag up top and title + date/place over a bottom scrim. Works for events (date) and
// venues (place). Presentation only.
export function PosterCard({ item, width, onPress }) {
  const uri = item.imageUrl || item.imageUrls?.[0];
  const isEvent = item.kind === 'event';
  const accent = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  const tag = (item.category ? categoryLabel(item.category) : (isEvent ? 'Event' : 'Place'));
  const meta = isEvent
    ? (item.startTime ? shortDate(item.startTime, item.market) : (item.venueName || null))
    : (item.city || item.address || null);
  const height = Math.round(width * 1.46);

  return (
    <Pressable style={[styles.poster, { width, height }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      {uri
        ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: accent }]} />}
      <LinearGradient
        colors={['rgba(11,18,32,0)', 'rgba(11,18,32,0.15)', 'rgba(11,18,32,0.92)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.tag, { backgroundColor: accent }]}>
        <AppText variant="caption" color={colors.onAccent} numberOfLines={1}>{tag.toUpperCase()}</AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="bodySemi" color={colors.textHi} numberOfLines={2}>{item.title}</AppText>
        {meta ? (
          <View style={styles.metaRow}>
            <Icon name={isEvent ? 'calendar' : 'pin'} size={12} color={colors.textLo} />
            <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.metaText}>{meta}</AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  poster: { borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.bgElevated2 },
  tag: { position: 'absolute', top: 10, left: 10, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8, maxWidth: '80%' },
  body: { padding: space.md, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1 },
});
