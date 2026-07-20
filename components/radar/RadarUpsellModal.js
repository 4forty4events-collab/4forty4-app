import React, { useState } from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { RadarPulse } from './RadarPulse';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Button } from '../ui/Button';
import { BrandLogo } from '../common/BrandLogo';

// The Radar reveal — a premium bottom sheet that teases the (future) proximity
// engine. Presentation only: the CTA acknowledges interest and closes; there's no
// backend yet. Reused from the You tab AND the feed teaser card.
const FEATURES = [
  ['⚡', 'Real-time'],
  ['💎', 'Curated Spots'],
  ['🛡️', 'Zero Noise'],
];

export function RadarUpsellModal({ visible, onClose }) {
  const [notified, setNotified] = useState(false);

  const close = () => { setNotified(false); onClose(); };
  const onCta = () => {
    if (notified) { close(); return; }
    setNotified(true);
    setTimeout(close, 1100); // let the confirmation land, then dismiss
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.hero}>
              <RadarPulse size={84} />
            </View>

            {/* Badge area — brand mark next to the flagship pill, above the title. */}
            <View style={styles.badgeRow}>
              <BrandLogo variant="symbol" size="sm" />
              <View style={styles.flagshipPill}>
                <AppText variant="caption" color={colors.bgBase}>👑 FLAGSHIP</AppText>
              </View>
            </View>

            <AppText variant="display" style={styles.headline}>4Forty4 Radar</AppText>

            <AppText variant="body" color={colors.textLo} style={styles.body}>
              Your live city ping. Get real-time alerts for underground spots,
              high-energy events, and top local venues the second you’re nearby.
            </AppText>

            <View style={styles.featureRow}>
              {FEATURES.map(([emoji, label]) => (
                <View key={label} style={styles.feature}>
                  <AppText style={styles.featureEmoji}>{emoji}</AppText>
                  <AppText variant="label" color={colors.textHi}>{label}</AppText>
                </View>
              ))}
            </View>

            {/* Curation standard — the quality promise, called out. */}
            <View style={styles.curationCard}>
              <AppText style={styles.shield}>🛡️</AppText>
              <AppText variant="label" color={colors.textLo} style={styles.curationText}>
                Zero Noise, Pure Vibe. No spam or filler. Radar only pings you when
                something real is happening close to you.
              </AppText>
            </View>
          </ScrollView>

          <AppText variant="caption" color={colors.textMute} style={styles.soon}>PREMIUM ACCESS · COMING SOON</AppText>
          <Button
            label={notified ? '✓ You’re on the list' : 'Notify Me When Unlocked'}
            onPress={onCta}
            disabled={notified}
            style={styles.cta}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: {
    backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: 'rgba(232,137,74,0.4)', padding: space.lg, paddingBottom: space.xl, maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.md },
  scroll: { alignItems: 'center' },
  hero: { marginTop: space.sm, marginBottom: space.base, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  flagshipPill: { backgroundColor: colors.star, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 12 },
  headline: { textAlign: 'center', marginBottom: space.sm },
  body: { textAlign: 'center', lineHeight: 22, paddingHorizontal: space.xs },
  featureRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgElevated2, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  featureEmoji: { fontSize: 14 },
  curationCard: {
    flexDirection: 'row', gap: space.sm, marginTop: space.lg, padding: space.base,
    backgroundColor: 'rgba(232,137,74,0.10)', borderWidth: 1, borderColor: 'rgba(232,137,74,0.32)', borderRadius: radius.md,
  },
  shield: { fontSize: 18, lineHeight: 24 },
  curationText: { flex: 1, lineHeight: 18, fontStyle: 'italic' },
  soon: { textAlign: 'center', marginTop: space.lg, marginBottom: space.sm, letterSpacing: 1 },
  cta: { marginTop: 0 },
});
