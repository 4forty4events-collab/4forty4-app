import React, { useState } from 'react';
import { Modal, View, TextInput, TouchableOpacity, FlatList, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocale } from '../../providers/LocaleProvider';
import { usePickerVenueSearch } from '../../lib/coordination/hooks';
import { CATEGORY_COLORS } from '../../lib/categories';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';

// Catalog browser for the manual "+ Add stop": search real venues in the trip's
// market and pick one. Deterministic CRUD — no AI. onPick receives { id, name }.
export function VenuePickerModal({ visible, onClose, market, onPick, busy }) {
  const { t } = useLocale();
  const [term, setTerm] = useState('');
  const { data: results = [], isLoading } = usePickerVenueSearch(market, term);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={10}><AppText variant="label" color={colors.textLo} style={styles.close}>{t('common.cancel')}</AppText></TouchableOpacity>
          <AppText variant="heading">{t('coordination.addStop')}</AppText>
          <View style={{ width: 54 }} />
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={term}
            onChangeText={setTerm}
            placeholder={t('coordination.searchPlaces')}
            placeholderTextColor={colors.textMute}
            autoCapitalize="none"
            autoFocus
          />
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ padding: space.base }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<AppText variant="body" color={colors.textLo} style={styles.empty}>{t('coordination.noItems')}</AppText>}
            renderItem={({ item: v }) => {
              const accent = CATEGORY_COLORS[v.category] ?? CATEGORY_COLORS.other;
              return (
                <TouchableOpacity style={styles.row} onPress={() => !busy && onPick?.(v)} disabled={!!busy} activeOpacity={0.7}>
                  {v.coverImageUrl
                    ? <Image source={{ uri: v.coverImageUrl }} style={styles.thumb} />
                    : <View style={[styles.thumb, { backgroundColor: accent }]} />}
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySemi" numberOfLines={1}>{v.name}</AppText>
                    <View style={styles.metaRow}>
                      {v.category ? <View style={[styles.chip, { borderColor: accent }]}><AppText variant="caption" color={accent}>{v.category}</AppText></View> : null}
                      {v.city ? <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.city}>{v.city}</AppText> : null}
                      {v.rating != null ? <AppText variant="caption" color={colors.star}>★ {Number(v.rating).toFixed(1)}</AppText> : null}
                    </View>
                  </View>
                  <AppText style={styles.plus} color={colors.accent}>＋</AppText>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  close: { width: 54 },
  searchWrap: { padding: space.md },
  search: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  empty: { textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 7 },
  city: { flexShrink: 1 },
  plus: { fontSize: 24 },
});
