import React, { useEffect, useState } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Chip } from '../ui/Chip';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';

export const DEFAULT_FILTERS = { kind: 'all', category: 'all', sort: 'relevance' };

const KINDS = [['all', 'Everything'], ['venue', 'Places'], ['event', 'Events']];
const SORTS = [['relevance', 'Best match'], ['rating', 'Top rated'], ['distance', 'Nearest'], ['recent', 'Newest']];

// Advanced filters for search — kind, sort, and category, all of which the `discover`
// RPC already understands (so results stay correctly paginated, not client-filtered).
// Edits a draft and applies on confirm, so backing out changes nothing.
export function SearchFilterSheet({ visible, filters, facets = [], hasLocation, onApply, onClose }) {
  const [draft, setDraft] = useState(filters ?? DEFAULT_FILTERS);
  useEffect(() => { if (visible) setDraft(filters ?? DEFAULT_FILTERS); }, [visible, filters]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headRow}>
          <AppText variant="title">Filters</AppText>
          <TouchableOpacity onPress={() => setDraft(DEFAULT_FILTERS)}><AppText variant="label" color={colors.accent2}>Reset</AppText></TouchableOpacity>
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>SHOW</AppText>
        <View style={styles.segment}>
          {KINDS.map(([k, lbl]) => (
            <TouchableOpacity key={k} style={[styles.segItem, draft.kind === k && styles.segItemOn]} onPress={() => set({ kind: k })}>
              <AppText variant="label" color={draft.kind === k ? colors.textHi : colors.textLo}>{lbl}</AppText>
            </TouchableOpacity>
          ))}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>SORT BY</AppText>
        <View style={styles.wrapRow}>
          {SORTS.map(([s, lbl]) => {
            const disabled = s === 'distance' && !hasLocation;
            return (
              <Chip key={s} label={lbl} selected={draft.sort === s} onPress={() => !disabled && set({ sort: s })} style={disabled ? styles.disabled : null} />
            );
          })}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>CATEGORY</AppText>
        <ScrollView style={styles.catScroll} contentContainerStyle={styles.wrapRow}>
          <Chip label="All" selected={draft.category === 'all'} onPress={() => set({ category: 'all' })} />
          {facets.map(({ category: c }) => (
            <Chip key={c} label={categoryLabel(c)} tint={CATEGORY_COLORS[c]} selected={draft.category === c} onPress={() => set({ category: c })} />
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.apply} onPress={() => { onApply(draft); onClose(); }}>
          <AppText variant="bodySemi" color={colors.onAccent}>Apply</AppText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { marginTop: space.base, marginBottom: space.sm },
  segment: { flexDirection: 'row', backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.sm },
  segItemOn: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  catScroll: { maxHeight: 140 },
  disabled: { opacity: 0.4 },
  apply: { marginTop: space.lg, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
});
