import React, { useCallback, useState } from 'react';
import {
  View, Image, FlatList, TouchableOpacity, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSession } from '../providers/SessionProvider';
import { normalizeVenue, normalizeEvent } from '../lib/feed';
import { fetchSavedItems } from '../lib/saves';
import { CATEGORY_COLORS } from '../lib/categories';
import { useCollections, useCreateCollection } from '../lib/collections/hooks';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Scrim } from '../components/ui/Scrim';
import { Icon } from '../components/ui/Icon';
import { SavedItemMenu } from '../components/saved/SavedItemMenu';
import { AddToCollectionSheet } from '../components/collections/AddToCollectionSheet';
import { CollectionFormModal } from '../components/collections/CollectionFormModal';

const TABS = [
  { key: 'favorite', label: 'Favorites' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'collections', label: 'Collections' },
];

function SavedTile({ item, onOpen, onMenu }) {
  const catColor = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  return (
    <Pressable style={styles.tile} onPress={onOpen}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.tileImage} />
      ) : (
        <View style={[styles.tileImage, styles.tileFallback, { backgroundColor: catColor }]}>
          <AppText variant="label" color="rgba(255,255,255,0.92)">{item.category ?? 'place'}</AppText>
        </View>
      )}
      <Scrim style={{ top: '40%' }} />
      <View style={styles.tilePillRow}>
        <View style={styles.kindPill}>
          <AppText variant="caption" color={colors.textHi}>{item.savedPinned ? '★ ' : ''}{item.kind === 'event' ? 'EVENT' : 'PLACE'}</AppText>
        </View>
        <Pressable style={styles.menuBtn} onPress={onMenu} hitSlop={6} accessibilityLabel="Item actions">
          <Icon name="more" size={18} color={colors.textHi} />
        </Pressable>
      </View>
      <View style={styles.tileCaption}>
        <AppText variant="bodySemi" numberOfLines={2}>{item.title}</AppText>
      </View>
    </Pressable>
  );
}

function CollectionCard({ collection, onPress }) {
  return (
    <TouchableOpacity style={styles.colCard} onPress={onPress}>
      <AppText variant="display" style={styles.colEmoji}>{collection.emoji ?? '📁'}</AppText>
      <View style={{ flex: 1 }}>
        <AppText variant="bodySemi" numberOfLines={1}>{collection.is_pinned ? '★ ' : ''}{collection.name}</AppText>
        <AppText variant="label" color={colors.textLo}>{collection.count} {collection.count === 1 ? 'place' : 'places'}</AppText>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textMute} />
    </TouchableOpacity>
  );
}

export default function SavedScreen({ navigation }) {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user?.id ?? null;

  const [tab, setTab] = useState('favorite');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [menuItem, setMenuItem] = useState(null);   // SavedItemMenu target
  const [collectItem, setCollectItem] = useState(null); // AddToCollectionSheet target
  const [createOpen, setCreateOpen] = useState(false);

  const { data: collections = [], isLoading: colLoading } = useCollections(userId);
  const createCollection = useCreateCollection(userId);

  const isListTab = tab === 'favorite' || tab === 'wishlist';

  const load = useCallback(async () => {
    if (!session || !isListTab) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSavedItems(session.user.id, normalizeVenue, normalizeEvent, { list: tab });
      setItems(data);
    } catch (e) {
      setError(e.message ?? 'Could not load your saves');
    } finally {
      setLoading(false);
    }
  }, [session, tab, isListTab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session && !sessionLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="title" style={styles.centerText}>Sign in to see your saved listings</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>Save places and events you love and find them here.</AppText>
        <Button label="Sign in" full={false} onPress={() => navigation.navigate('SignIn')} />
      </SafeAreaView>
    );
  }

  const emptyText = tab === 'wishlist'
    ? 'Nothing on your wishlist yet — tap the bookmark on a place you want to visit.'
    : 'You haven’t saved anything yet — browse and tap the heart.';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <AppText variant="title">Saved</AppText>
        <TouchableOpacity style={styles.calendarBtn} onPress={() => navigation.navigate('Calendar')} hitSlop={8}>
          <Icon name="calendar" size={20} color={colors.textHi} />
        </TouchableOpacity>
      </View>

      <View style={styles.segment}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.segmentItem, tab === t.key && styles.segmentItemActive]} onPress={() => setTab(t.key)}>
            <AppText variant="label" color={tab === t.key ? colors.textHi : colors.textLo}>{t.label}</AppText>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'collections' ? (
        colLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
        ) : (
          <FlatList
            key="collections"
            style={styles.list}
            data={collections}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.colListContent}
            ListHeaderComponent={
              <TouchableOpacity style={styles.newCol} onPress={() => setCreateOpen(true)}>
                <Icon name="plus" size={18} color={colors.accent} />
                <AppText variant="bodySemi" color={colors.accent}>New collection</AppText>
              </TouchableOpacity>
            }
            ListEmptyComponent={
              <AppText variant="body" color={colors.textLo} style={styles.colEmpty}>Group places into lists like “Date night” or “Weekend in Algiers”.</AppText>
            }
            renderItem={({ item: c }) => (
              <CollectionCard collection={c} onPress={() => navigation.navigate('CollectionDetail', { collection: c })} />
            )}
          />
        )
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : error ? (
        <View style={styles.center}>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error}</AppText>
          <Button label="Retry" variant="secondary" full={false} onPress={load} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>{emptyText}</AppText>
        </View>
      ) : (
        <FlatList
          key="saved-grid"
          style={styles.list}
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SavedTile
              item={item}
              onOpen={() => navigation.navigate('ListingDetail', { item })}
              onMenu={() => setMenuItem(item)}
            />
          )}
        />
      )}

      <SavedItemMenu
        visible={!!menuItem}
        onClose={() => setMenuItem(null)}
        userId={userId}
        item={menuItem}
        list={tab}
        onChanged={load}
        onAddToCollection={(it) => setCollectItem(it)}
      />
      <AddToCollectionSheet
        visible={!!collectItem}
        onClose={() => setCollectItem(null)}
        userId={userId}
        item={collectItem}
      />
      <CollectionFormModal
        visible={createOpen}
        submitting={createCollection.isPending}
        onSubmit={(data) => createCollection.mutate(data, { onSuccess: () => setCreateOpen(false) })}
        onClose={() => setCreateOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.sm },
  calendarBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', marginHorizontal: space.base, marginBottom: space.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line },
  list: { flex: 1 },
  listContent: { padding: space.base, gap: space.md },
  column: { gap: space.md },
  colListContent: { padding: space.base, gap: space.sm },
  newCol: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.base, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderStyle: 'dashed', marginBottom: space.sm },
  colEmpty: { textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.lg },
  colCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  colEmoji: { width: 44, textAlign: 'center' },
  tile: { flex: 1, aspectRatio: 0.82, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  tileImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tileFallback: { alignItems: 'center', justifyContent: 'center' },
  tilePillRow: { position: 'absolute', top: space.sm, left: space.sm, right: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kindPill: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  menuBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  tileCaption: { position: 'absolute', left: space.md, right: space.md, bottom: space.md },
});
