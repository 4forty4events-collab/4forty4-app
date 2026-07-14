import React, { useMemo, useState } from 'react';
import { View, Image, FlatList, TouchableOpacity, Pressable, ActivityIndicator, Alert, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { CATEGORY_COLORS } from '../lib/categories';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { Scrim } from '../components/ui/Scrim';
import {
  useCollections, useCollectionItems, useRenameCollection,
  useSetCollectionPinned, useDeleteCollection, useToggleCollectionItem,
  useSetCollectionPublic,
} from '../lib/collections/hooks';
import { CollectionFormModal } from '../components/collections/CollectionFormModal';

function Tile({ item, onOpen, onRemove }) {
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
      <TouchableOpacity style={styles.remove} onPress={onRemove} hitSlop={8} accessibilityLabel="Remove from collection">
        <Icon name="close" size={15} color={colors.textHi} />
      </TouchableOpacity>
      <View style={styles.tileCaption}>
        <AppText variant="bodySemi" numberOfLines={2}>{item.title}</AppText>
      </View>
    </Pressable>
  );
}

// A single collection: its items as a grid, with rename / pin / delete in the header
// and per-tile removal. Reads the live collection meta from the cache (so a rename
// or count change reflects immediately) and falls back to the route param.
export default function CollectionDetailScreen({ route, navigation }) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const passed = route.params?.collection;
  const collectionId = passed?.id;

  const { data: collections = [] } = useCollections(userId);
  const meta = useMemo(
    () => collections.find((c) => c.id === collectionId) ?? passed,
    [collections, collectionId, passed],
  );
  const { data: items = [], isLoading } = useCollectionItems(collectionId);
  const rename = useRenameCollection(userId);
  const setPinned = useSetCollectionPinned(userId);
  const del = useDeleteCollection(userId);
  const toggleItem = useToggleCollectionItem(userId);
  const setPublic = useSetCollectionPublic(userId);
  const [editOpen, setEditOpen] = useState(false);

  const onOpen = (item) => navigation.navigate('ListingDetail', { item });

  const shareLink = (slug) => `https://4forty4.app/c/${slug}`;

  // Ensure the collection is public (mints a slug the first time), then open the
  // share sheet with the link.
  const onShare = async () => {
    try {
      let slug = meta?.share_slug;
      if (!meta?.is_public || !slug) {
        slug = await setPublic.mutateAsync({ id: collectionId, isPublic: true });
      }
      if (slug) await Share.share({ message: `Check out my "${meta?.name}" collection on 4forty4 — ${shareLink(slug)}` });
    } catch (e) {
      Alert.alert('Could not share', String(e?.message ?? e));
    }
  };

  const onMakePrivate = () => setPublic.mutate({ id: collectionId, isPublic: false });

  const onRemove = (item) =>
    toggleItem.mutate({ collectionId, kind: item.kind, id: item.id, add: false });

  const onDelete = () => {
    Alert.alert('Delete collection?', `"${meta?.name}" will be removed. Your saved places stay in Saved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(collectionId, { onSuccess: () => navigation.goBack() }) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <View style={styles.headActions}>
          <TouchableOpacity onPress={onShare} hitSlop={8} style={styles.headBtn} disabled={setPublic.isPending}>
            <Icon name="share" size={19} color={meta?.is_public ? colors.accent2 : colors.textHi} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPinned.mutate({ id: collectionId, pinned: !meta?.is_pinned })} hitSlop={8} style={styles.headBtn}>
            <Icon name="bookmark" size={19} color={meta?.is_pinned ? colors.accent : colors.textHi} fill={!!meta?.is_pinned} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditOpen(true)} hitSlop={8} style={styles.headBtn}>
            <Icon name="edit" size={19} color={colors.textHi} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.headBtn}>
            <Icon name="trash" size={19} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="display">{meta?.emoji ? `${meta.emoji} ` : ''}{meta?.name ?? 'Collection'}</AppText>
        <View style={styles.metaLine}>
          <AppText variant="label" color={colors.textLo}>{items.length} {items.length === 1 ? 'place' : 'places'}</AppText>
          {meta?.is_public && (
            <TouchableOpacity onPress={onMakePrivate} hitSlop={6}>
              <AppText variant="label" color={colors.accent2}>· 🌐 Shared · Make private</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>Nothing here yet. Add places from any listing’s “Save to collection”.</AppText>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(it) => `${it.kind}-${it.id}`}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <Tile item={item} onOpen={() => onOpen(item)} onRemove={() => onRemove(item)} />}
        />
      )}

      <CollectionFormModal
        visible={editOpen}
        initial={meta}
        submitting={rename.isPending}
        onSubmit={(data) => rename.mutate({ id: collectionId, ...data }, { onSuccess: () => setEditOpen(false) })}
        onClose={() => setEditOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { paddingHorizontal: space.base, paddingBottom: space.sm, gap: 2 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  list: { flex: 1 },
  listContent: { padding: space.base, gap: space.md },
  column: { gap: space.md },
  tile: { flex: 1, aspectRatio: 0.82, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  tileImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tileFallback: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: space.sm, right: space.sm, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  tileCaption: { position: 'absolute', left: space.md, right: space.md, bottom: space.md },
});
