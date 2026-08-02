import React, { useEffect, useRef } from 'react';
import { View, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { AppText, colors, space, radius, useReducedMotion } from '../../lib/theme';

// Live Around You — the city's heartbeat, and the clearest statement of what Purday is.
//
// Opening the feed shouldn't show you a wall of last month's photos; it should tell you
// how alive the city is right now. These counts come from live_pulse, which only counts
// posts that are still in their present tense (live / on the way, inside a time window),
// so an empty pulse is an honest answer — the city is quiet — not a bug.
//
// Deliberately NOT rendered when the count is zero: a "0 experiences happening now" card
// every morning would train people to ignore the panel entirely.

// One glyph per category, so the breakdown scans without reading.
const GLYPHS = {
  restaurant: '🍽', cafe: '☕', nightlife: '🍸', music_event: '🎵', festival: '🎪',
  sports: '⚽', outdoor: '⛰', tourism: '🗺', hotel: '🏨', shopping: '🛍',
  wellness: '💆', culture: '🏛', entertainment: '🎬', education: '📚', meetup: '👥', other: '📍',
};

function LiveDot({ size = 9, color = '#22C55E' }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, v]);

  return (
    <View style={[styles.dotWrap, { width: size * 2.4, height: size * 2.4 }]}>
      {!reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, {
            width: size * 2.4, height: size * 2.4, borderRadius: size * 1.2, backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          }]}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

export function LivePulse({ pulse, onPress }) {
  const total = pulse?.total ?? 0;
  if (!total) return null;

  const rows = (pulse.rows ?? []).filter((r) => r.n > 0).slice(0, 6);
  const a11y = `Live around you: ${total} ${total === 1 ? 'experience' : 'experiences'} happening now. `
    + rows.map((r) => `${r.n} ${categoryLabel(r.category)}`).join(', ');

  return (
    <Pressable style={styles.card} onPress={onPress} accessible accessibilityRole="button" accessibilityLabel={a11y}>
      <View style={styles.head}>
        <LiveDot />
        <AppText variant="caption" color="#22C55E" style={styles.eyebrow}>LIVE AROUND YOU</AppText>
      </View>

      <AppText variant="title" color={colors.textHi} style={styles.count}>
        {total} {total === 1 ? 'experience' : 'experiences'} happening now
      </AppText>

      <View style={styles.rows}>
        {rows.map((r) => {
          const tint = CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS.other;
          return (
            <View key={r.category} style={[styles.pill, { borderColor: `${tint}66` }]}>
              <AppText style={styles.glyph}>{GLYPHS[r.category] ?? GLYPHS.other}</AppText>
              <AppText variant="caption" color={colors.textHi}>{r.n}</AppText>
              <AppText variant="caption" color={colors.textLo} numberOfLines={1}>{categoryLabel(r.category)}</AppText>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.base, marginBottom: space.lg, padding: space.base,
    borderRadius: radius.lg, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eyebrow: { letterSpacing: 1 },
  count: { fontSize: 19 },
  dotWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  glyph: { fontSize: 12 },
});
