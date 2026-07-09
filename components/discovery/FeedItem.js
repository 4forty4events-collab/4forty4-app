import React, { useRef } from 'react';
import { View, Image, Animated, Pressable, StyleSheet } from 'react-native';
import { AppText, colors, space, radius } from '../../lib/theme';
import { CATEGORY_COLORS } from '../../lib/categories';
import { Chip } from '../ui/Chip';
import { Button } from '../ui/Button';
import { Scrim } from '../ui/Scrim';
import { Icon } from '../ui/Icon';

// One full-bleed page of the discovery feed. The real R2 photo fills the screen; a
// bottom scrim carries name / one-line Google description / category + rating /
// save + add-to-trip. Single tap opens detail, double tap saves (Instagram-familiar).
// Subtle image parallax on paging (disabled under reduce-motion). Presentation only —
// save + add-to-trip call the existing endpoints via the parent's handlers.
export function FeedItem({
  item, index, scrollY, itemHeight, topInset, bottomInset,
  saved, onRequestSave, onOpen, onAddToTrip, reducedMotion,
}) {
  const isEvent = item.kind === 'event';
  const catColor = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;

  // Image overflows the viewport by 12.5% top/bottom so the parallax translate
  // never reveals an edge. Native-driven transforms only.
  const parallax = itemHeight * 0.1;
  const inputRange = [(index - 1) * itemHeight, index * itemHeight, (index + 1) * itemHeight];
  const translateY = reducedMotion
    ? 0
    : scrollY.interpolate({ inputRange, outputRange: [-parallax, 0, parallax], extrapolate: 'clamp' });

  // Double-tap detection without a gesture lib (works on web + native). A lone tap
  // resolves to "open" after the double-tap window; a second tap cancels it → save.
  const lastTap = useRef(0);
  const singleTimer = useRef(null);
  const burst = useRef(new Animated.Value(0)).current;

  const fireBurst = () => {
    burst.setValue(0);
    Animated.sequence([
      Animated.spring(burst, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 0, delay: 350, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 260) {
      if (singleTimer.current) clearTimeout(singleTimer.current);
      lastTap.current = 0;
      fireBurst();
      onRequestSave(item, true); // double-tap always saves
    } else {
      lastTap.current = now;
      if (singleTimer.current) clearTimeout(singleTimer.current);
      singleTimer.current = setTimeout(() => onOpen(item), 260);
    }
  };

  const price = item.pricePerPerson != null
    ? `${item.priceEstimated ? '≈ ' : ''}${item.pricePerPerson} ${item.currency ?? (item.market === 'ZW' ? 'USD' : 'DZD')}/pp`
    : null;
  const distance = item.distanceM != null
    ? (item.distanceM < 1000 ? `${Math.round(item.distanceM)} m` : `${(item.distanceM / 1000).toFixed(item.distanceM < 10000 ? 1 : 0)} km`)
    : null;

  return (
    <View style={{ height: itemHeight, width: '100%', backgroundColor: colors.bgBase }}>
      {/* Image (or category-tinted fallback) */}
      <View style={styles.imageWrap}>
        {item.imageUrl ? (
          <Animated.Image
            source={{ uri: item.imageUrl }}
            resizeMode="cover"
            style={[styles.image, { height: itemHeight * 1.25, top: -itemHeight * 0.125, transform: [{ translateY }] }]}
          />
        ) : (
          <View style={[styles.image, styles.fallback, { height: itemHeight, top: 0, backgroundColor: catColor }]}>
            <AppText variant="title" color="rgba(255,255,255,0.9)">{item.category ?? 'place'}</AppText>
          </View>
        )}
      </View>

      {/* Tap layer: single = open, double = save. Sits under the bottom controls. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} />

      {/* Double-tap heart burst */}
      <Animated.View
        pointerEvents="none"
        style={[styles.burst, { opacity: burst, transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) }] }]}
      >
        <Icon name="heart" size={120} fill color="rgba(232,137,74,0.92)" strokeWidth={0} />
      </Animated.View>

      <Scrim style={{ top: '45%' }} />

      {/* Bottom overlay */}
      <View style={[styles.overlay, { paddingBottom: bottomInset + space.lg }]} pointerEvents="box-none">
        <View style={styles.metaTop} pointerEvents="none">
          <Chip label={isEvent ? 'EVENT' : 'PLACE'} floating />
          {distance ? <AppText variant="caption" color={colors.textHi}>{distance}</AppText> : null}
        </View>

        <AppText variant="display" numberOfLines={2} style={styles.name}>{item.title}</AppText>

        {item.description ? (
          <AppText variant="body" color={colors.textLo} numberOfLines={1} style={styles.desc}>{item.description}</AppText>
        ) : null}

        <View style={styles.tagRow} pointerEvents="none">
          {item.category ? <Chip label={item.category} floating /> : null}
          {item.rating != null ? (
            <View style={styles.rating}>
              <Icon name="star" size={14} fill color={colors.star} strokeWidth={1.4} />
              <AppText variant="num" color={colors.textHi}>{Number(item.rating).toFixed(1)}</AppText>
              {item.reviewCount ? <AppText variant="caption" color={colors.textLo}>{`  (${item.reviewCount})`}</AppText> : null}
            </View>
          ) : null}
          {price ? <AppText variant="num" color={colors.accent}>{price}</AppText> : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => onRequestSave(item, !saved)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
            style={[styles.saveBtn, saved && styles.saveBtnOn]}
          >
            <Icon name="heart" size={22} fill={saved} color={saved ? colors.accent : colors.textHi} />
          </Pressable>
          <Button
            label="Add to trip"
            icon="＋"
            variant="primary"
            full={false}
            onPress={() => onAddToTrip(item)}
            style={styles.addBtn}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: colors.bgElevated },
  image: { position: 'absolute', width: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  burst: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  burstHeart: { fontSize: 120, color: 'rgba(232,137,74,0.92)' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, gap: space.sm },
  metaTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  name: { marginBottom: 2 },
  desc: {},
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  saveBtn: { width: 48, height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' },
  saveBtnOn: { borderColor: colors.accent },
  saveHeart: { fontSize: 22 },
  addBtn: { flex: 1, paddingVertical: 13 },
});
