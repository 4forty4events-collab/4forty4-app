import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Pressable, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { formatVenueTitle } from '../../lib/format';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, useReducedMotion } from '../../lib/theme';

// Each recommendation slides in after the previous one — the "AI composing your day"
// reveal. Collapses to an instant show under Reduce Motion.
function RevealRow({ index, reduced, children }) {
  const o = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const x = useRef(new Animated.Value(reduced ? 0 : 18)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.parallel([
      Animated.timing(o, { toValue: 1, duration: 280, delay: index * 130, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 280, delay: index * 130, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={{ opacity: o, transform: [{ translateX: x }] }}>{children}</Animated.View>;
}

// An AI chat message carrying a target payload. Two shapes:
//   single: { kind, id, title, subtitle }
//   bundle: { items: [{ slot_title, kind, id, title }] }  -> a composed day
// Each recommendation is interactive: open the detail, ♥ save it, or ＋ add it to the
// itinerary. Adds are gated to editors; saving works for anyone signed in.
export function AiSuggestionCard({ message, canEdit, onAdd, onAddBundle, onOpen, onFavorite, adding }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const p = message.payload ?? {};
  const items = Array.isArray(p.items) ? p.items : null;
  const [saved, setSaved] = useState(() => new Set());

  const toggleSave = (node) => {
    const on = !saved.has(node.id);
    setSaved((s) => { const n = new Set(s); if (on) n.add(node.id); else n.delete(node.id); return n; });
    onFavorite?.(node, on);
  };

  const TargetRow = ({ node, slot }) => {
    const isEvent = node.kind === 'event';
    const on = saved.has(node.id);
    return (
      <View style={styles.target}>
        <View style={[styles.thumb, isEvent ? styles.thumbEvent : styles.thumbVenue]}>
          <AppText style={styles.thumbGlyph}>{isEvent ? '🎫' : '📍'}</AppText>
        </View>
        <Pressable style={styles.targetText} onPress={() => onOpen?.(node.kind, node.id)}>
          {slot ? <AppText variant="caption" color={colors.accent2} numberOfLines={1} style={styles.slot}>{slot}</AppText> : null}
          <AppText variant="bodySemi" numberOfLines={1}>{formatVenueTitle(node.title) ?? (isEvent ? 'Event' : 'Venue')}</AppText>
          {node.subtitle ? <AppText variant="label" color={colors.textLo} numberOfLines={1} style={styles.targetSub}>{node.subtitle}</AppText> : null}
        </Pressable>
        <Pressable onPress={() => toggleSave(node)} hitSlop={6} style={styles.iconBtn} accessibilityLabel={on ? 'Unsave' : 'Save'}>
          <Icon name="heart" size={18} color={on ? colors.danger : colors.textMute} fill={on} />
        </Pressable>
        {canEdit ? (
          <Pressable onPress={() => onAdd?.(node)} hitSlop={6} style={styles.addChip} disabled={adding} accessibilityLabel="Add to itinerary">
            <Icon name="plus" size={16} color={colors.onAccent} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.brandMark}><Icon name="spark" size={13} color="#fff" fill /></View>
        <AppText variant="bodySemi" color={colors.accent2}>Purday AI</AppText>
      </View>
      {message.body ? <AppText variant="body" color={colors.textLo} style={styles.body}>{message.body}</AppText> : null}

      {items ? (
        <>
          <View style={styles.timeline}>
            {items.map((it, i) => (
              <RevealRow key={`${it.id}-${i}`} index={i} reduced={reduced}>
                <TargetRow node={it} slot={it.slot_title} />
              </RevealRow>
            ))}
          </View>
          <TouchableOpacity style={[styles.addFull, !canEdit && styles.addBtnDisabled]} onPress={() => onAddBundle?.(items)} disabled={!canEdit || adding}>
            {adding ? <ActivityIndicator color="#fff" size="small" /> : <AppText variant="label" color="#fff">＋ {t('coordination.addFullDay')}</AppText>}
          </TouchableOpacity>
        </>
      ) : (
        <RevealRow index={0} reduced={reduced}><TargetRow node={p} /></RevealRow>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: 'rgba(79,163,199,0.35)', borderRadius: radius.lg, padding: space.base, marginVertical: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  brandMark: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent2, alignItems: 'center', justifyContent: 'center' },
  body: { marginBottom: space.md, lineHeight: 21 },
  timeline: { gap: space.sm, marginBottom: space.md },
  target: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated2, borderRadius: radius.md, padding: space.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  thumbVenue: { backgroundColor: 'rgba(232,137,74,0.18)' },
  thumbEvent: { backgroundColor: 'rgba(79,163,199,0.18)' },
  thumbGlyph: { fontSize: 18 },
  targetText: { flex: 1 },
  slot: { marginBottom: 2 },
  targetSub: { marginTop: 2 },
  iconBtn: { padding: 4 },
  addChip: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addFull: { backgroundColor: colors.accent2, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.5 },
});
