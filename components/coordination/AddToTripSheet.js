import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale } from '../../providers/LocaleProvider';
import { useMyTrips } from '../../lib/coordination/hooks';
import { addTripItem } from '../../lib/coordination/coordinationRepository';
import { AppText, colors, space, radius } from '../../lib/theme';

// Append order that stays small + monotonically increasing, so a stop added later
// sorts after earlier ones within its (null) day. User can reorder afterwards.
export const appendSortOrder = () => Math.max(0, Math.floor(Date.now() / 1000) - 1700000000);

// Self-contained "Add to trip" bottom sheet (dark). Drop it anywhere a venue is
// shown (detail screen, discovery feed); it loads the user's OWN editable trips
// and inserts the venue via the SAME trip_items path the chat curator uses — no AI.
export function AddToTripSheet({ visible, onClose, userId, venue }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data: trips = [], isLoading } = useMyTrips(userId);
  const [busyId, setBusyId] = useState(null);
  const [doneTitle, setDoneTitle] = useState(null);
  const [error, setError] = useState(null);

  const editable = trips.filter((tr) => tr.myRole === 'owner' || tr.myRole === 'editor');

  const close = () => { setDoneTitle(null); setError(null); setBusyId(null); onClose?.(); };

  const pick = async (tr) => {
    if (!venue?.id || busyId) return;
    setError(null);
    setBusyId(tr.id);
    try {
      await addTripItem(tr.id, { type: venue.kind === 'event' ? 'event' : 'venue', id: venue.id }, { addedBy: userId, sortOrder: appendSortOrder() });
      qc.invalidateQueries({ queryKey: ['tripItinerary', tr.id] });
      setDoneTitle(tr.title);
      setTimeout(close, 850);
    } catch (e) {
      setError(e?.message ?? 'Could not add.');
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <AppText variant="title">{t('coordination.addToTrip')}</AppText>
        {venue?.name ? <AppText variant="body" color={colors.textLo} numberOfLines={1} style={styles.venueName}>{venue.name}</AppText> : null}

        {doneTitle ? (
          <View style={styles.doneBox}>
            <AppText variant="bodySemi" color={colors.success} style={styles.doneText}>✓ {t('coordination.addedToTrip').replace('{trip}', doneTitle)}</AppText>
          </View>
        ) : !userId ? (
          <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('community.signInToReview')}</AppText>
        ) : isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : editable.length === 0 ? (
          <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('coordination.noEditableTrips')}</AppText>
        ) : (
          <FlatList
            data={editable}
            keyExtractor={(tr) => tr.id}
            style={{ maxHeight: 320 }}
            renderItem={({ item: tr }) => (
              <TouchableOpacity style={styles.tripRow} onPress={() => pick(tr)} disabled={!!busyId}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySemi" numberOfLines={1}>{tr.title}</AppText>
                  {tr.startDate ? <AppText variant="label" color={colors.textLo} style={styles.tripDates}>{tr.startDate}{tr.endDate && tr.endDate !== tr.startDate ? ` → ${tr.endDate}` : ''}</AppText> : null}
                </View>
                {busyId === tr.id ? <ActivityIndicator color={colors.accent} /> : <AppText style={styles.plus} color={colors.accent}>＋</AppText>}
              </TouchableOpacity>
            )}
          />
        )}

        {error ? <AppText variant="label" color={colors.danger} style={styles.error}>{error}</AppText> : null}

        <TouchableOpacity style={styles.cancelBtn} onPress={close}>
          <AppText variant="label" color={colors.textLo}>{t('common.cancel')}</AppText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  venueName: { marginTop: 2, marginBottom: space.sm },
  empty: { textAlign: 'center', marginVertical: 24 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tripDates: { marginTop: 2 },
  plus: { fontSize: 22 },
  doneBox: { backgroundColor: 'rgba(79,190,143,0.14)', borderRadius: radius.md, padding: space.base, marginVertical: space.base },
  doneText: { textAlign: 'center' },
  error: { marginTop: space.sm, textAlign: 'center' },
  cancelBtn: { marginTop: space.base, paddingVertical: space.md, alignItems: 'center' },
});
