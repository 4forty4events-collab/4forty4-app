import React, { useState } from 'react';
import { View, Pressable, Image, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Scrim } from '../ui/Scrim';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { BRAND, PROCEEDS_TAG, formatPrice, availableSizes, isSoldOut } from './catalog';

// A full-width editorial "plate" for one apparel item — lookbook, not e-commerce grid.
// Art direction is a 2-stop diagonal gradient with the TOZVINZWISISA wordmark printed
// large and faint beneath a legibility scrim, so it always renders premium with zero
// image dependency; drop a real `product.image` uri in later and it layers on top.
// Featured items carry an ambient colored halo (iOS shadow / Android elevation).
export function LookbookCard({ product, market, onPress }) {
  const { width } = useWindowDimensions();
  const cardW = width - space.lg * 2;
  const height = Math.round(cardW * (product.featured ? 1.22 : 1.0));
  const priceLabel = formatPrice(product.price, market);
  const images = product.images?.length ? product.images : (product.image ? [product.image] : []);
  const [active, setActive] = useState(0);
  const soldOut = isSoldOut(product);
  const sizes = availableSizes(product.sizes);

  return (
    <Pressable
      onPress={soldOut ? undefined : onPress}
      disabled={soldOut}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${priceLabel}${soldOut ? ', sold out' : ''}`}
      style={({ pressed }) => [styles.wrap, pressed && !soldOut && styles.pressed]}
    >
      {/* Ambient halo — a tinted glow that reads as a lit product, strongest on the drop. */}
      <View
        style={[
          styles.halo,
          { height, shadowColor: product.glow, shadowOpacity: product.featured ? 0.55 : 0.32, shadowRadius: product.featured ? 30 : 18 },
        ]}
      >
        <View style={[styles.card, { height }]}>
          <LinearGradient
            colors={product.tint}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Faint printed wordmark — the "plate" signature. */}
          <View style={styles.printWrap} pointerEvents="none">
            <AppText style={styles.print} numberOfLines={1}>{BRAND}</AppText>
          </View>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              scrollEnabled={images.length > 1}
              showsHorizontalScrollIndicator={false}
              style={StyleSheet.absoluteFill}
              onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / cardW))}
            >
              {images.map((uri, i) => (
                <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: cardW, height }} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : null}
          <Scrim
            colors={['transparent', 'rgba(11,18,32,0.35)', 'rgba(11,18,32,0.96)']}
            locations={[0, 0.45, 1]}
          />

          {/* Top ribbon: category + drop badge */}
          <View style={styles.topRow}>
            <View style={styles.catTag}><AppText style={styles.catText}>{product.category}</AppText></View>
            {soldOut ? (
              <View style={styles.soldBadge}><AppText style={styles.soldBadgeText}>SOLD OUT</AppText></View>
            ) : product.featured ? (
              <View style={[styles.dropBadge, { borderColor: product.glow }]}>
                <Icon name="spark" size={12} color={product.glow} fill />
                <AppText style={[styles.dropText, { color: product.glow }]}>{product.kind}</AppText>
              </View>
            ) : null}
          </View>

          {/* Bottom editorial block */}
          <View style={styles.body}>
            {images.length > 1 ? (
              <View style={styles.dots}>
                {images.map((_, i) => <View key={i} style={[styles.dot, i === active && styles.dotOn]} />)}
              </View>
            ) : null}
            <View style={styles.priceTag}>
              <AppText style={styles.priceText}>{priceLabel}</AppText>
            </View>
            <AppText style={styles.name} numberOfLines={2}>{product.name}</AppText>
            <AppText variant="label" color="rgba(255,255,255,0.72)" style={styles.fabric}>{product.fabric}</AppText>

            {sizes.length > 0 && !soldOut ? (
              <View style={styles.sizeLine}>
                <AppText variant="caption" color="rgba(255,255,255,0.6)">SIZES</AppText>
                {sizes.map((s) => (
                  <View key={s} style={styles.sizePip}><AppText variant="caption" color={colors.textHi}>{s}</AppText></View>
                ))}
              </View>
            ) : null}

            <View style={styles.proceedsRow}>
              <View style={styles.proceedsDot} />
              <AppText variant="caption" color="rgba(255,255,255,0.68)" style={styles.proceeds}>{PROCEEDS_TAG}</AppText>
            </View>

            <View style={styles.ctaRow}>
              {soldOut ? (
                <AppText variant="label" color={colors.textMute}>Sold out — back soon</AppText>
              ) : (
                <>
                  <AppText variant="label" color={colors.textHi}>Reserve · Support</AppText>
                  <Icon name="chevronRight" size={18} color={colors.textHi} />
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.xl },
  pressed: { opacity: 0.94, transform: [{ scale: 0.992 }] },
  // Halo carries the shadow; the card clips content. Elevation gives Android a lift.
  halo: { borderRadius: radius.xl, shadowOffset: { width: 0, height: 10 }, elevation: 10, backgroundColor: colors.bgElevated2 },
  card: { borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.bgElevated2 },

  printWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  print: { fontFamily: fonts.display, fontSize: 46, letterSpacing: 2, color: 'rgba(255,255,255,0.12)' },

  topRow: { position: 'absolute', top: space.base, left: space.base, right: space.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catTag: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  catText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2, color: colors.textHi },
  dropBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 11 },
  dropText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.6 },
  soldBadge: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  soldBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.6, color: '#fff' },
  sizeLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, flexWrap: 'wrap' },
  sizePip: { minWidth: 24, alignItems: 'center', paddingVertical: 3, paddingHorizontal: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.08)' },

  body: { padding: space.lg, gap: space.xs },
  dots: { flexDirection: 'row', gap: 5, marginBottom: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.42)' },
  dotOn: { backgroundColor: '#fff', width: 16 },
  priceTag: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14, marginBottom: space.xs },
  priceText: { fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 0.4, color: colors.onAccent },
  name: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: '#fff' },
  fabric: { marginTop: 4, lineHeight: 19 },
  proceedsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.sm },
  proceedsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  proceeds: { flex: 1, lineHeight: 15, letterSpacing: 0.3 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: space.md },
});
