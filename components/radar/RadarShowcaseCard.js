import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { RadarPulse } from './RadarPulse';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Icon } from '../ui/Icon';

// The premium, standalone Radar showcase for the You tab — a portrait "asset card",
// deliberately NOT a list row. Generous padding, a warm ambient glow (the pulse plus
// a colored shadow) and a whisper-thin gold border give it its own presence, set
// apart from the grids above and the action list below. Taps open the reveal modal.
export function RadarShowcaseCard({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="4Forty4 Radar — flagship, coming soon"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <RadarPulse size={58} />
        <View style={styles.flagship}>
          <AppText variant="caption" color={colors.bgBase}>👑 FLAGSHIP</AppText>
        </View>
      </View>

      <AppText variant="title" style={styles.title}>4Forty4 Radar</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.subtitle}>
        Real-time alerts the split-second you’re near premium venues & major events.
      </AppText>

      <View style={styles.footer}>
        <AppText variant="label" color={colors.accent}>Preview the flagship</AppText>
        <Icon name="chevronRight" size={16} color={colors.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: space.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(232,137,74,0.35)',
    // Ambient warm glow — the pulse reads as lighting its own card (iOS colored shadow;
    // Android falls back to a soft neutral elevation).
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pressed: { opacity: 0.9 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  flagship: { backgroundColor: colors.star, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 11 },
  title: { fontSize: 22, marginBottom: 4 },
  subtitle: { lineHeight: 21, marginBottom: space.base },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
