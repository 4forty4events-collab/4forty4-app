import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { formatVenueTitle } from '../../lib/format';
import { AppText, colors, space, radius } from '../../lib/theme';

// Renders an AI chat message that carries a target payload. Two shapes:
//  - single: { kind, id, title, subtitle }              -> one suggestion + Add
//  - bundle: { items: [{ slot_title, kind, id, title }] } -> Day Timeline Bundle
// Target rows are pressable (deep-link to the catalog detail). The Add actions
// are disabled for viewers.
export function AiSuggestionCard({ message, canEdit, onAdd, onAddBundle, onOpen, adding }) {
  const { t } = useLocale();
  const p = message.payload ?? {};
  const items = Array.isArray(p.items) ? p.items : null;

  const TargetRow = ({ node, slot }) => (
    <TouchableOpacity style={styles.target} onPress={() => onOpen?.(node.kind, node.id)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        {slot ? <AppText variant="caption" color={colors.accent2} style={styles.slot}>{slot}</AppText> : null}
        <AppText variant="bodySemi" numberOfLines={1}>{formatVenueTitle(node.title) ?? (node.kind === 'event' ? 'Event' : 'Venue')}</AppText>
        {node.subtitle ? <AppText variant="label" color={colors.textLo} numberOfLines={1} style={styles.targetSub}>{node.subtitle}</AppText> : null}
      </View>
      <AppText style={styles.chevron} color={colors.accent2}>›</AppText>
    </TouchableOpacity>
  );

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <AppText variant="caption" color={colors.accent2}>🤖 {items ? t('coordination.dayPlan') : t('coordination.suggestion')}</AppText>
      </View>
      {message.body ? <AppText variant="body" color={colors.textLo} style={styles.body}>{message.body}</AppText> : null}

      {items ? (
        <>
          <View style={styles.timeline}>
            {items.map((it, i) => <TargetRow key={`${it.id}-${i}`} node={it} slot={it.slot_title} />)}
          </View>
          <TouchableOpacity style={[styles.addBtn, styles.addFull, !canEdit && styles.addBtnDisabled]} onPress={() => onAddBundle?.(items)} disabled={!canEdit || adding}>
            {adding ? <ActivityIndicator color="#fff" size="small" /> : <AppText variant="label" color="#fff">＋ {t('coordination.addFullDay')}</AppText>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TargetRow node={p} />
          <TouchableOpacity style={[styles.addBtn, !canEdit && styles.addBtnDisabled]} onPress={() => onAdd?.(p)} disabled={!canEdit || adding}>
            {adding ? <ActivityIndicator color="#fff" size="small" /> : <AppText variant="label" color="#fff">＋ {t('coordination.addToItinerary')}</AppText>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: 'rgba(79,163,199,0.35)', borderRadius: radius.lg, padding: space.base, marginVertical: space.sm },
  badgeRow: { flexDirection: 'row', marginBottom: 6 },
  body: { marginBottom: space.sm },
  timeline: { gap: space.sm, marginBottom: space.md },
  target: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated2, borderRadius: radius.md, padding: space.md },
  slot: { marginBottom: 2 },
  targetSub: { marginTop: 2 },
  chevron: { fontSize: 20 },
  addBtn: { backgroundColor: colors.accent2, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  addFull: { paddingVertical: 13 },
  addBtnDisabled: { opacity: 0.5 },
});
