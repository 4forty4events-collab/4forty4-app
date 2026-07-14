import React from 'react';
import { View, Pressable, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Scrim } from '../ui/Scrim';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { BRAND, formatPrice } from './catalog';
import { usePromotedMerch } from '../../lib/merch/hooks';

// The Discover "ad" — a full-width promo banner for whichever product the admin has
// flagged `promoted` in the Merch Manager. Renders NOTHING when nothing is promoted, so
// it's safe to always mount on Discover. Everyone sees it; only the admin can enable it.
export function MerchPromoCard({ market, onPress }) {
  const { data: promoted } = usePromotedMerch();
  const { width } = useWindowDimensions();
  if (!promoted || !promoted.length) return null;

  const p = promoted[0]; // featured-first; a single anchor reads as one clean ad
  const height = Math.round((width - space.base * 2) * 0.52);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${p.name} — official merch, support the platform`}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={[styles.card, { height, shadowColor: p.glow }]}>
        <LinearGradient colors={p.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.printWrap} pointerEvents="none">
          <AppText style={styles.print} numberOfLines={1}>{BRAND}</AppText>
        </View>
        {p.image ? <Image source={{ uri: p.image }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <Scrim colors={['rgba(11,18,32,0.15)', 'rgba(11,18,32,0.55)', 'rgba(11,18,32,0.95)']} locations={[0, 0.5, 1]} />

        <View style={styles.topRow}>
          <View style={styles.adTag}><AppText style={styles.adText}>OFFICIAL MERCH</AppText></View>
        </View>

        <View style={styles.body}>
          <AppText variant="caption" color={colors.accent} style={styles.kicker}>SUPPORT THE VISION</AppText>
          <AppText style={styles.name} numberOfLines={1}>{p.name}</AppText>
          <View style={styles.footerRow}>
            <View style={styles.priceTag}><AppText style={styles.priceText}>{formatPrice(p.price, market)}</AppText></View>
            <View style={styles.cta}>
              <AppText variant="label" color={colors.textHi}>Shop the collection</AppText>
              <Icon name="chevronRight" size={16} color={colors.textHi} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.base, marginBottom: space.lg },
  pressed: { opacity: 0.94 },
  card: { borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.bgElevated2, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },

  printWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  print: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 2, color: 'rgba(255,255,255,0.1)' },

  topRow: { position: 'absolute', top: space.base, left: space.base, right: space.base, flexDirection: 'row' },
  adTag: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 },
  adText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.8, color: colors.textHi },

  body: { padding: space.base },
  kicker: { letterSpacing: 2 },
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: '#fff', marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  priceTag: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 13 },
  priceText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAccent },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
