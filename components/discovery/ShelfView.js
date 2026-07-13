import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ShelfRow } from './ShelfRow';
import { sortImagesFirst } from '../../lib/feed';
import { AppText, colors, space } from '../../lib/theme';

// Dumb, presentational horizontal shelf: a title/See-all header over a static card row
// (ShelfRow — Netflix-style swipe, no auto-motion). Renders NOTHING when empty (and not
// loading) so a dead shelf never leaves a dangling header. Images-first ordering: listings
// with a real cover lead; imageless placeholders are relegated to the far end.
export function ShelfView({ title, subtitle, items, isLoading, onPressItem, onSeeAll, variant }) {
  // Images-first so a placeholder card is never among the first things seen; the static row
  // then shows them left to right (placeholders only reachable by scrolling to the far end).
  const data = useMemo(() => sortImagesFirst(items ?? []), [items]);

  if (!isLoading && data.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headingBlock}>
          <AppText variant="title" style={styles.title}>{title}</AppText>
          {subtitle ? <AppText variant="label" color={colors.textLo} style={styles.subtitle}>{subtitle}</AppText> : null}
        </View>
        {onSeeAll && data.length ? (
          <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
            <AppText variant="label" color={colors.accent2} style={styles.seeAll}>See all</AppText>
          </TouchableOpacity>
        ) : null}
      </View>

      <ShelfRow data={data} onPressItem={onPressItem} variant={variant} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: space.base, marginBottom: space.sm },
  headingBlock: { flex: 1 },
  title: { fontSize: 20 },
  subtitle: { marginTop: 2 },
  seeAll: { marginLeft: space.md },
});
