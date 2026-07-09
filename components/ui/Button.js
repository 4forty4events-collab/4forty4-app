import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText, colors, radius, space } from '../../lib/theme';

// The app's button. `variant`: primary (accent — the one bold moment), secondary
// (outlined, quiet), ghost (text-only), danger. Press state dims/deepens; disabled
// mutes. Full-width by default; pass style to constrain.
export function Button({
  label, onPress, variant = 'primary', disabled, loading, icon, style, textColor, full = true,
}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        full && styles.full,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !isDisabled && { backgroundColor: v.bgPress ?? v.bg, opacity: v.bgPress ? 1 : 0.85 },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <AppText variant="bodySemi" color={textColor ?? v.fg} style={styles.icon}>{icon}</AppText> : null}
          <AppText variant="label" color={textColor ?? v.fg} style={styles.label}>{label}</AppText>
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: colors.accent, bgPress: colors.accentPress, border: 'transparent', fg: colors.onAccent },
  secondary: { bg: 'transparent', border: colors.line, fg: colors.textHi },
  ghost: { bg: 'transparent', border: 'transparent', fg: colors.accent2 },
  danger: { bg: 'transparent', border: 'rgba(229,96,94,0.4)', fg: colors.danger },
};

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, paddingVertical: 14, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { fontSize: 15 },
  label: { fontSize: 15 },
});
