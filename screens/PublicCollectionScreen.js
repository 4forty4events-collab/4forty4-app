import React from 'react';
import { View, Image, FlatList, TouchableOpacity, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CATEGORY_COLORS } from '../lib/categories';
import { useCollectionItems, useCollectionBySlug } from '../lib/collections/hooks';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { Scrim } from '../components/ui/Scrim';

// Read-only view of someone's SHARED collection (RLS lets non-owners read public
// collections + their items). No edit affordances — that's the difference from the
// owner's CollectionDetailScreen. Reached in-app with a `collection` object, or via
// an inbound deep link (fourty4://c/<slug>) that carries just a `slug` to resolve.
export default function PublicCollectionScreen({ route, navigation }) {
  const passed = route.params?.collection;
  const slug = route.params?.slug;
  const { data: bySlug, isLoading: slugLoading } = useCollectionBySlug(passed ? null : slug);
  const c = passed ?? bySlug;
  const { data: items = [], isLoading: itemsLoading } = useCollectionItems(c?.id);
  const isLoading = slugLoading || (!!c && itemsLoading);

  // Deep-linked to a slug that resolved to nothing (private/deleted).
  if (slug && !passed && !slugLoading && !c) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="title">Collection unavailable</AppText>
        <AppText variant="body" color={colors.textLo} style={{ textAlign: 'center' }}>This collection is private or no longer shared.</AppText>
        <TouchableOpacity onPress={() => navigation.goBack()}><AppText variant="label" color={colors.accent2}>Go back</AppText></TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading" numberOfLines={1} style={styles.title}>{c?.emoji ? `${c.emoji} ` : ''}{c?.name ?? 'Collection'}</AppText>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo}>This collection is empty.</AppText></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.kind}-${it.id}`}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const catColor = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
            return (
              <Pressable style={styles.tile} onPress={() => navigation.navigate('ListingDetail', { item })}>
                {item.imageUrl
                  ? <Image source={{ uri: item.imageUrl }} style={styles.tileImage} />
                  : <View style={[styles.tileImage, styles.tileFallback, { backgroundColor: catColor }]}><AppText variant="label" color="rgba(255,255,255,0.92)">{item.category ?? 'place'}</AppText></View>}
                <Scrim style={{ top: '40%' }} />
                <View style={styles.tileCaption}><AppText variant="bodySemi" numberOfLines={2}>{item.title}</AppText></View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs, gap: space.sm },
  title: { flex: 1, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.base, paddingHorizontal: space.xl },
  list: { padding: space.base, gap: space.md },
  column: { gap: space.md },
  tile: { flex: 1, aspectRatio: 0.82, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  tileImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tileFallback: { alignItems: 'center', justifyContent: 'center' },
  tileCaption: { position: 'absolute', left: space.md, right: space.md, bottom: space.md },
});
