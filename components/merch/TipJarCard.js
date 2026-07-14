import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { TIPS, formatAmount } from './catalog';

// Interactive "Direct Contribution" tier — a lighter card variant for supporters who
// just want to fund the platform without merch. Pick a preset (market currency), or
// leave it and Contribute uses the middle tier. onContribute(amountLabel) opens the
// same manual-payment checkout the apparel uses.
export function TipJarCard({ market, onContribute }) {
  const tiers = TIPS[market] ?? TIPS.DZ;
  const [selected, setSelected] = useState(tiers[1]);

  return (
    <View style={styles.halo}>
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(79,163,199,0.16)', 'rgba(232,137,74,0.10)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headRow}>
          <View style={styles.iconBadge}><Icon name="heart" size={18} color={colors.accent} fill /></View>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.accent2} style={styles.kicker}>DIRECT CONTRIBUTION</AppText>
            <AppText variant="heading" style={styles.title}>Tip the Vision</AppText>
          </View>
        </View>

        <AppText variant="body" color={colors.textLo} style={styles.blurb}>
          No merch, all heart. Chip in directly to keep the servers lit and the flagship shipping.
        </AppText>

        <View style={styles.tierRow}>
          {tiers.map((amount) => {
            const on = selected === amount;
            return (
              <Pressable
                key={amount}
                onPress={() => setSelected(amount)}
                style={[styles.tier, on && styles.tierOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <AppText style={[styles.tierText, on && styles.tierTextOn]}>{formatAmount(amount, market)}</AppText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => onContribute(formatAmount(selected, market))}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          accessibilityRole="button"
        >
          <AppText variant="label" color={colors.onAccent}>Contribute {formatAmount(selected, market)}</AppText>
          <Icon name="send" size={16} color={colors.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { borderRadius: radius.xl, shadowColor: colors.accent2, shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8, backgroundColor: colors.bgElevated, marginBottom: space.xl },
  card: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg, backgroundColor: colors.bgElevated },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconBadge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,137,74,0.16)', borderWidth: 1, borderColor: 'rgba(232,137,74,0.4)' },
  kicker: { letterSpacing: 2 },
  title: { marginTop: 2 },
  blurb: { marginTop: space.md, lineHeight: 21 },

  tierRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  tier: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase },
  tierOn: { borderColor: colors.accent, backgroundColor: 'rgba(232,137,74,0.14)' },
  tierText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textLo },
  tierTextOn: { color: colors.textHi },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.lg, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15 },
  ctaPressed: { backgroundColor: colors.accentPress },
});
