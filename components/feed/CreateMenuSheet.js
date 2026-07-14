import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

// The create menu behind the Feed FAB. Each option maps to an existing flow (the parent
// owns routing via onSelect). Photo/Video open the moment composer; the place-scoped ones
// (Review/Question/Place) route through Search to pick a place first; Event → OrganizerHub.
const OPTIONS = [
  { key: 'photo', label: 'Photo', icon: 'image', hint: 'Share a moment' },
  { key: 'video', label: 'Video', icon: 'image', hint: 'Coming soon' },
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
            <View style={styles.iconCircle}><Icon name={o.icon} size={22} color={colors.accent} /></View>
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
