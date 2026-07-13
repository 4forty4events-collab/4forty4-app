import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, Image, Pressable, useWindowDimensions, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useDiscovery } from '../../lib/discovery/hooks/useDiscovery';
import { hasCoverImage } from '../../lib/feed';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, fonts, useReducedMotion } from '../../lib/theme';

// Featured Today — the one deliberately-moving element on Discover. A full-width snap
// carousel of a handful of standout spots that auto-advances slowly, pauses the instant a
// finger lands, and resumes after the user goes idle (per the "motion as punctuation, not
// wallpaper" direction). Everything else on Discover is static. Respects reduce-motion:
// no auto-advance and no entrance fade when the OS asks for reduced motion.
const AUTO_MS = 5200;    // dwell on a slide before gliding to the next
const RESUME_MS = 8000;  // idle after a manual swipe before auto-advance resumes
const GAP = 12;
const MAX = 5;           // at most a handful of hero slides

function FeaturedCard({ item, width, height, onPress }) {
  const uri = item.imageUrl || item.imageUrls?.[0];
  const rating = item.rating != null ? Number(item.rating).toFixed(1) : null;
  const where = item.city || item.venueName || item.address || null;
  return (
    <Pressable style={[styles.card, { width, height }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      {uri
        ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated2 }]} />}
      {/* Bottom-up scrim so the title stays legible over any photo. */}
      <LinearGradient
        colors={['rgba(11,18,32,0)', 'rgba(11,18,32,0.2)', 'rgba(11,18,32,0.92)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tag}><AppText variant="caption" color={colors.textHi}>🔥 Popular</AppText></View>
      <View style={styles.body}>
        <AppText style={styles.title} numberOfLines={1}>{item.title}</AppText>
        {where ? (
          <View style={styles.whereRow}>
            <Icon name="pin" size={14} color={colors.textLo} />
            <AppText variant="label" color={colors.textLo} numberOfLines={1} style={styles.whereText}>{where}</AppText>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          {rating ? (
            <View style={styles.metaItem}>
              <Icon name="star" size={14} fill color={colors.star} strokeWidth={1.2} />
              <AppText variant="num" color={colors.textHi}>{rating}</AppText>
              {item.reviewCount ? <AppText variant="caption" color={colors.textLo}>{` (${item.reviewCount})`}</AppText> : null}
            </View>
          ) : <View />}
          <View style={styles.seeMore}>
            <AppText variant="label" color={colors.onAccent}>See More</AppText>
            <Icon name="chevronRight" size={15} color={colors.onAccent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function FeaturedHero({ query, fallbackQuery, onPressItem }) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();

  // Same query + graceful fallback pattern as Shelf, so the hero is never empty when the
  // primary query (e.g. Editor's Picks) is still thin.
  const primary = useDiscovery(query, { staleTime: 120_000 });
  const useFallback = !!fallbackQuery && !primary.isLoading && (primary.items?.length ?? 0) === 0;
  const fallback = useDiscovery(fallbackQuery ?? query, { enabled: useFallback, staleTime: 120_000 });
  const source = useFallback ? fallback.items : primary.items;

  const slides = useMemo(() => (source ?? []).filter(hasCoverImage).slice(0, MAX), [source]);

  const CARD_W = width - space.base * 2;
  const CARD_H = Math.round(CARD_W * 0.62);
  const STRIDE = CARD_W + GAP;

  const listRef = useRef(null);
  const idx = useRef(0);
  const resumeT = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  // Gentle entrance the first time slides land.
  useEffect(() => {
    if (reduced || slides.length === 0) return;
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [reduced, slides.length, fade]);

  // Auto-advance with snap. Paused under touch and for reduce-motion.
  useEffect(() => {
    if (reduced || paused || slides.length <= 1) return undefined;
    const t = setInterval(() => {
      const next = (idx.current + 1) % slides.length;
      idx.current = next;
      setActive(next);
      listRef.current?.scrollToOffset({ offset: next * STRIDE, animated: true });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [reduced, paused, slides.length, STRIDE]);

  useEffect(() => () => clearTimeout(resumeT.current), []);

  if (primary.isLoading && slides.length === 0) {
    return <View style={{ height: CARD_H, marginHorizontal: space.base, borderRadius: radius.xl, backgroundColor: colors.bgElevated }} />;
  }
  if (slides.length === 0) return null;

  const pause = () => { setPaused(true); clearTimeout(resumeT.current); };
  const scheduleResume = () => { clearTimeout(resumeT.current); resumeT.current = setTimeout(() => setPaused(false), RESUME_MS); };

  return (
    <Animated.View style={{ opacity: fade }}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(it) => `${it.kind}-${it.id}`}
        renderItem={({ item }) => (
          <View style={{ width: CARD_W, marginRight: GAP }}>
            <FeaturedCard item={item} width={CARD_W} height={CARD_H} onPress={() => onPressItem?.(item)} />
          </View>
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STRIDE}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={styles.content}
        getItemLayout={(_, i) => ({ length: STRIDE, offset: STRIDE * i, index: i })}
        onScrollBeginDrag={pause}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / STRIDE);
          idx.current = i;
          setActive(i);
          scheduleResume();
        }}
      />
      {slides.length > 1 && (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={`${s.kind}-${s.id}`} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.base },
  card: { borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.bgElevated2 },
  tag: { position: 'absolute', top: space.md, left: space.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 },
  body: { padding: space.base },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: '#fff' },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  whereText: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeMore: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: space.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { width: 20, backgroundColor: colors.accent },
});
