import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText, colors, radius, space } from '../../lib/theme';

// Pill chip for categories/filters. `selected` fills with accent; `tint` lets a
// category color drive the active fill (used by the discovery category rail).
// `floating` gives the glassy over-photography treatment for the feed overlay.
export function Chip({ label, selected, onPress, tint, floating, style }) {
  const activeBg = tint ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        floating ? styles.floating : styles.solid,
        selected && { backgroundColor: activeBg, borderColor: activeBg },
        pressed && onPress && { opacity: 0.8 },
        style,
      ]}
    >
      <AppText variant="caption" color={selected ? colors.onAccent : (floating ? colors.textHi : colors.textLo)}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 13 },
  solid: { backgroundColor: colors.bgElevated, borderColor: colors.line },
  floating: { backgroundColor: colors.glass, borderColor: colors.glassBorder },
});
