import React from 'react';
import { View, Pressable, Switch, StyleSheet } from 'react-native';
import { RadarPulse } from './RadarPulse';
import { AppText, colors, space, radius } from '../../lib/theme';

// The Radar feed interstitial — a full-width, editorial "native advert" that divides
// major shelf sections. An eyebrow label, the pulsing mark, a one-line pitch, and a
// DISABLED toggle read as a premium locked feature rather than a tappable list button.
// Warm border + ambient glow tie it to the profile showcase. Taps open the reveal.
export function RadarTeaserCard({ onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="4Forty4 Radar — flagship, coming soon"
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <AppText variant="caption" color={colors.textMute} style={styles.eyebrow}>FLAGSHIP · COMING SOON</AppText>

      <View style={styles.row}>
        <RadarPulse size={50} />

        <View style={styles.body}>
          <AppText variant="bodySemi" style={styles.title}>👑 4Forty4 Radar</AppText>
          <AppText variant="label" color={colors.textLo} numberOfLines={2} style={styles.subtitle}>
            Real-time alerts the split-second you’re near premium venues & major events.
          </AppText>
        </View>

        {/* Locked tease: a disabled switch. pointerEvents:none so taps hit the card. */}
        <View pointerEvents="none" style={styles.toggleWrap}>
          <Switch value={false} disabled trackColor={{ true: colors.accent, false: colors.bgElevated2 }} thumbColor="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.base,
    marginTop: space.xs,
    marginBottom: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(232,137,74,0.4)',
    backgroundColor: colors.bgElevated,
    // Ambient warm glow so it reads as a premium asset, not a flat button.
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pressed: { opacity: 0.9 },
  eyebrow: { letterSpacing: 1.2, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1 },
  title: { marginBottom: 3 },
  subtitle: { lineHeight: 16 },
  toggleWrap: { opacity: 0.9 },
});
