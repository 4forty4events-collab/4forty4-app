import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { AppText } from '../../lib/theme';

// Trust-tier badge — a verification signal, visually distinct from the Community
// achievement badges. Renders nothing for 'standard'/unknown. Dark-surface tints.
const TIER = {
  verified_citizen: { icon: '🛡', color: '#7CC6DD', bg: 'rgba(79,163,199,0.16)', border: 'rgba(79,163,199,0.4)' },
  community_guide: { icon: '★', color: '#E7C061', bg: 'rgba(240,181,74,0.16)', border: 'rgba(240,181,74,0.4)' },
};

export function TrustBadge({ tier, compact = false }) {
  const { t } = useLocale();
  const cfg = TIER[tier];
  if (!cfg) return null;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <AppText style={styles.icon} color={cfg.color}>{cfg.icon}</AppText>
      {!compact ? <AppText variant="caption" color={cfg.color}>{t(`safety.tier_${tier}`)}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingVertical: 2, paddingHorizontal: 7 },
  icon: { fontSize: 11 },
});
