import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

// The create menu behind the Feed FAB.
//
// Stage 5A reframed this around WHEN an experience is happening rather than what medium
// it's in: the top three entries open the composer pre-set to an experience type (Live
// Now is the one the app can verify), replacing the old generic Photo/Video pair. The
// place-scoped ones (Review/Question/Place) still route through Search to pick a place
// first; Event → OrganizerHub. The parent owns routing via onSelect.
const OPTIONS = [
  { key: 'live', label: 'Live Now', icon: 'pin', hint: 'I’m here right now', accent: '#22C55E' },
  { key: 'on_the_way', label: 'On My Way', icon: 'send', hint: 'Heading somewhere' },
  { key: 'memory', label: 'Memory', icon: 'image', hint: 'Something from before' },
  { key: 'review', label: 'Review', icon: 'star', hint: 'Rate a place' },
  { key: 'event', label: 'Event', icon: 'calendar', hint: 'Host something' },
  { key: 'place', label: 'Place', icon: 'pin', hint: 'Add a spot' },
  { key: 'question', label: 'Question', icon: 'comment', hint: 'Ask locals' },
];

export function CreateMenuSheet({ visible, onClose, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Create" avoidKeyboard={false}>
      <View style={styles.grid}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.key}
            style={styles.tile}
            onPress={() => { onClose?.(); onSelect?.(o.key); }}
            accessibilityLabel={o.label}
          >
            <View style={styles.iconCircle}><Icon name={o.icon} size={22} color={o.accent ?? colors.accent} /></View>
            <AppText variant="bodySemi" color={colors.textHi}>{o.label}</AppText>
            <AppText variant="caption" color={colors.textMute}>{o.hint}</AppText>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47%', flexGrow: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, paddingVertical: space.base, paddingHorizontal: space.base, gap: 4 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated2, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
