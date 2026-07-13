import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useForYou } from '../../lib/discovery/hooks/useForYou';
import { categoryLabel } from '../../lib/categories';
import { ExperienceCard } from './ExperienceCard';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

const CARD_W = 168;

// The personalized shelf, rendered as the "AI Picks for you" list: a leading rationale panel
// ("Because you liked <top category>") followed by a static row of compact cards. Same
// useForYou data as before — just a distinct, more intelligent-feeling presentation. Hidden
// when there's nothing personalized yet.
function topCategory(items) {
  const tally = {};
  for (const it of items) if (it.category) tally[it.category] = (tally[it.category] ?? 0) + 1;
  let best = null; let bestN = 0;
  for (const [cat, n] of Object.entries(tally)) if (n > bestN) { best = cat; bestN = n; }
  return best;
}

export function AiPicksShelf({ userId, market, coords, onPressItem }) {
  const { items = [], isLoading } = useForYou({ userId, market, near: coords });
  const data = useMemo(() => items.slice(0, 10), [items]);
  const topCat = useMemo(() => topCategory(data), [data]);

  if (!isLoading && data.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>AI Picks for you</AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <View style={styles.rationale}>
          <Icon name="spark" size={20} color={colors.accent2} fill />
          <AppText variant="caption" color={colors.textLo} style={styles.because}>BECAUSE YOU LIKED</AppText>
          <AppText variant="bodySemi" color={colors.textHi}>{topCat ? categoryLabel(topCat) : 'your favourites'}</AppText>
        </View>
        {data.map((item, i) => (
          <View key={`${item.kind}-${item.id}-${i}`} style={styles.slot}>
            <ExperienceCard item={item} width={CARD_W} imageHeight={104} onPress={() => onPressItem?.(item)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  header: { paddingHorizontal: space.base, marginBottom: space.sm },
  title: { fontSize: 20 },
  row: { paddingHorizontal: space.base, gap: space.md, alignItems: 'stretch' },
  rationale: { width: 150, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent2, backgroundColor: colors.bgElevated, padding: space.base, justifyContent: 'center', gap: 4 },
  because: { letterSpacing: 0.8 },
  slot: { width: CARD_W },
});
