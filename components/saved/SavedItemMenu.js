import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Icon } from '../ui/Icon';
import { setSavePinned, setSaveList, removeSave } from '../../lib/saves';

// Per-item actions for a saved tile (bottom sheet): pin to top, move between
// Favorites/Wishlist, add to a collection, or remove. Runs the mutation itself and
// calls onChanged() so the list reloads; "Add to collection" is delegated upward
// (the sheet lives at screen level so it can stack over this one cleanly).
export function SavedItemMenu({ visible, onClose, userId, item, list, onChanged, onAddToCollection }) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onChanged?.();
      onClose?.();
    } catch (e) {
      // e.g. Pin/Move write against a column that doesn't exist until the pending
      // collections migration is applied — surface it instead of crashing.
      Alert.alert('Not available yet', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const pinned = !!item.savedPinned;
  const otherList = list === 'wishlist' ? 'favorite' : 'wishlist';
  const otherLabel = otherList === 'wishlist' ? 'Move to Wishlist' : 'Move to Favorites';

  const Row = ({ icon, label, onPress, danger }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={busy}>
      <Icon name={icon} size={19} color={danger ? colors.danger : colors.textHi} />
      <AppText variant="body" color={danger ? colors.danger : colors.textHi}>{label}</AppText>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <AppText variant="bodySemi" numberOfLines={1} style={styles.title}>{item.title}</AppText>
        {busy && <ActivityIndicator color={colors.accent} style={styles.busy} />}

        <Row icon="bookmark" label={pinned ? 'Unpin' : 'Pin to top'} onPress={() => run(() => setSavePinned(userId, item.kind, item.id, !pinned))} />
        <Row icon="heart" label={otherLabel} onPress={() => run(() => setSaveList(userId, item.kind, item.id, otherList))} />
        <Row icon="plus" label="Add to collection…" onPress={() => { onClose?.(); onAddToCollection?.(item); }} />
        <Row icon="trash" label="Remove from saved" danger onPress={() => run(() => removeSave(userId, item.kind, item.id))} />

        <TouchableOpacity style={styles.cancel} onPress={onClose}>
          <AppText variant="label" color={colors.textLo}>Cancel</AppText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  title: { marginBottom: space.sm },
  busy: { position: 'absolute', top: space.lg, right: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cancel: { marginTop: space.base, paddingVertical: space.md, alignItems: 'center' },
});
