import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, radius, space } from '../../lib/theme';

// Elevated surface on the dark base. Elevation reads as a subtle raised fill +
// hairline border (shadows are near-invisible on dark). Pass onPress to make it
// tappable with a quiet press state.
export function Card({ children, onPress, style, padded = true }) {
  const content = [styles.card, padded && styles.padded, style];
  if (!onPress) return <View style={content}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...content, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  padded: { padding: space.base },
  pressed: { backgroundColor: colors.bgElevated2 },
});
