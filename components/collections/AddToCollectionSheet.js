import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Icon } from '../ui/Icon';
import { useCollections, useItemCollections, useToggleCollectionItem, useCreateCollection } from '../../lib/collections/hooks';
import { CollectionFormModal } from './CollectionFormModal';

// "Save to collection" bottom sheet. Lists the user's collections with a live
// checkmark for the ones already holding this item; tapping toggles membership.
// A "New collection" row opens the form and, on create, drops the item straight in
// — the common one-shot flow (make a list AND add to it in a single gesture).
export function AddToCollectionSheet({ visible, onClose, userId, item }) {
  const kind = item?.kind;
  const id = item?.id;
  const { data: collections = [], isLoading } = useCollections(userId);
  const { data: memberIds } = useItemCollections(userId, kind, id);
  const toggle = useToggleCollectionItem(userId);
  const createCollection = useCreateCollection(userId);
  const [formOpen, setFormOpen] = useState(false);

  const inSet = (cid) => !!memberIds?.has(cid);

  const onToggle = (cid) => {
    if (!id) return;
    toggle.mutate({ collectionId: cid, kind, id, add: !inSet(cid) });
  };

  const onCreate = async ({ name, emoji }) => {
    const created = await createCollection.mutateAsync({ name, emoji });
    setFormOpen(false);
    if (created?.id && id) toggle.mutate({ collectionId: created.id, kind, id, add: true });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <AppText variant="title">Save to collection</AppText>
        {item?.title ? <AppText variant="body" color={colors.textLo} numberOfLines={1} style={styles.sub}>{item.title}</AppText> : null}

        {!userId ? (
          <AppText variant="body" color={colors.textLo} style={styles.empty}>Sign in to build collections.</AppText>
        ) : isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : (
          <FlatList
            data={collections}
            keyExtractor={(c) => c.id}
            style={{ maxHeight: 340 }}
            ListEmptyComponent={<AppText variant="body" color={colors.textLo} style={styles.empty}>No collections yet — create your first below.</AppText>}
            renderItem={({ item: c }) => {
              const active = inSet(c.id);
              return (
                <TouchableOpacity style={styles.row} onPress={() => onToggle(c.id)}>
                  <AppText variant="title" style={styles.rowEmoji}>{c.emoji ?? '📁'}</AppText>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySemi" numberOfLines={1}>{c.name}</AppText>
                    <AppText variant="label" color={colors.textLo}>{c.count} {c.count === 1 ? 'place' : 'places'}</AppText>
                  </View>
                  <View style={[styles.check, active && styles.checkActive]}>
                    {active && <Icon name="check" size={15} color={colors.onAccent} />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity style={styles.newRow} onPress={() => setFormOpen(true)}>
          <Icon name="plus" size={18} color={colors.accent} />
          <AppText variant="bodySemi" color={colors.accent}>New collection</AppText>
        </TouchableOpacity>

        <TouchableOpacity style={styles.done} onPress={onClose}>
          <AppText variant="label" color={colors.textLo}>Done</AppText>
        </TouchableOpacity>
      </View>

      <CollectionFormModal
        visible={formOpen}
        submitting={createCollection.isPending}
        onSubmit={onCreate}
        onClose={() => setFormOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  sub: { marginTop: 2, marginBottom: space.sm },
  empty: { textAlign: 'center', marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowEmoji: { width: 30, textAlign: 'center' },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.base, marginTop: space.xs },
  done: { marginTop: space.xs, paddingVertical: space.md, alignItems: 'center' },
});
