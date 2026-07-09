import React from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { ExperienceCard } from './ExperienceCard';
import { AppText, colors, space } from '../../lib/theme';

const SHELF_CARD_WIDTH = 230;

// Dumb, presentational horizontal shelf: given items, render them. Renders
// NOTHING when empty (and not loading) so a dead shelf never leaves a dangling
// header. Both the query-backed Shelf and the RecentlyViewedShelf render through
// this — one look, two data sources.
export function ShelfView({ title, subtitle, items, isLoading, onPressItem, onSeeAll }) {
  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headingBlock}>
          <AppText variant="title" style={styles.title}>{title}</AppText>
          {subtitle ? <AppText variant="label" color={colors.textLo} style={styles.subtitle}>{subtitle}</AppText> : null}
        </View>
        {onSeeAll && items?.length ? (
          <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
            <AppText variant="label" color={colors.accent2} style={styles.seeAll}>See all</AppText>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={items ?? []}
        keyExtractor={(it) => `${it.kind}-${it.id}`}
        renderItem={({ item }) => (
          <ExperienceCard item={item} width={SHELF_CARD_WIDTH} onPress={() => onPressItem?.(item)} />
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
      />
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
  row: { paddingHorizontal: space.base },
});
