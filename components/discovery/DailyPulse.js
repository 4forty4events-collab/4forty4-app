import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, Animated, Easing, FlatList, ActivityIndicator,
  useWindowDimensions, StyleSheet,
} from 'react-native';
import { Scrim } from '../ui/Scrim';
import { InlineDrop } from './InlineDrop';
import { useDailyPulse } from '../../lib/discovery/hooks/useDailyPulse';
import { useDrops } from '../../lib/discovery/hooks/useDrops';
import { colors, space, radius, fonts, useReducedMotion } from '../../lib/theme';

// ── "The Daily Pulse" ────────────────────────────────────────────────────────────
// A luxury, living heartbeat of upcoming local culture. Two tiers: a full-bleed
// Spotlight billboard (boosted event) with a kinetic marquee title, over a virtualized
// magazine-cover stream. Glassmorphism uses the app's `glass` token (swap to expo-blur
// for true blur — see PERF NOTES at the bottom). All motion honors reduce-motion.
//
// Near-black cinematic overlays are used locally for the billboard while the app's
// accent (warm) / accent2 (sea-blue) / danger act as the "neon". Swap these for true
// neons if you want to diverge harder from the house palette.

const MARKET_OFFSET_H = { DZ: 1, ZW: 2 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function marketDate(ms, market) {
  return new Date(ms + (MARKET_OFFSET_H[market] ?? 0) * 3600 * 1000);
}
function fmtDate(iso, market) {
  const d = marketDate(new Date(iso).getTime(), market);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${hh}:${mm}`;
}
// LIVE NOW while running; TONIGHT if it's today in the market's day; else the date.
function eventStatus(startIso, endIso, market) {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : start + 3 * 3600 * 1000;
  if (now >= start && now <= end) return { label: 'LIVE NOW', tone: 'live' };
  const dNow = marketDate(now, market);
  const dStart = marketDate(start, market);
  const sameDay =
    dNow.getUTCFullYear() === dStart.getUTCFullYear() &&
    dNow.getUTCMonth() === dStart.getUTCMonth() &&
    dNow.getUTCDate() === dStart.getUTCDate();
  if (sameDay && start >= now) return { label: 'TONIGHT', tone: 'soon' };
  return { label: fmtDate(startIso, market), tone: 'date' };
}

// Performance-first image container. RN Image today; drop-in `expo-image` (Image +
// contentFit="cover", recyclingKey) once installed — see PERF NOTES.
function PosterImage({ uri, style }) {
  if (!uri) return <View style={[style, styles.posterFallback]} />;
  return <Image source={{ uri }} style={style} resizeMode="cover" progressiveRenderingEnabled />;
}

// Subtle scale-down on press — the premium tactile micro-interaction.
function PressableScale({ onPress, children, style }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(s, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start()}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Glassmorphism tag. Uses the app glass token now; wrap in <BlurView> for true blur.
function GlassTag({ label, style }) {
  return (
    <View style={[styles.glassTag, style]}>
      <Text style={styles.glassTagText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status, large }) {
  const live = status.tone === 'live';
  const soon = status.tone === 'soon';
  return (
    <View style={[styles.status, live && styles.statusLive, soon && styles.statusSoon, large && styles.statusLarge]}>
      {live && <LiveDot />}
      <Text style={[styles.statusText, live && styles.statusTextLive, soon && styles.statusTextSoon]}>{status.label}</Text>
    </View>
  );
}

// Pulsing dot for LIVE NOW.
function LiveDot() {
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, a]);
  return <Animated.View style={[styles.liveDot, { opacity: a }]} />;
}

// Kinetic marquee: if the title overflows, it scrolls continuously (two copies for a
// seamless loop). Short titles or reduce-motion render statically.
function MarqueeText({ text, style }) {
  const reduced = useReducedMotion();
  const [cw, setCw] = useState(0);
  const [tw, setTw] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const overflowing = tw > 0 && cw > 0 && tw > cw;
  const GAP = 44;

  useEffect(() => {
    if (reduced || !overflowing) { x.setValue(0); return undefined; }
    const distance = tw + GAP;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, { toValue: -distance, duration: distance * 24, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [reduced, overflowing, tw, x]);

  return (
    <View style={styles.marqueeWrap} onLayout={(e) => setCw(e.nativeEvent.layout.width)}>
      {overflowing ? (
        <Animated.View style={[styles.marqueeRow, { transform: [{ translateX: x }] }]}>
          <Text style={[style, { paddingRight: GAP }]} onLayout={(e) => setTw(e.nativeEvent.layout.width)}>{text}</Text>
          <Text style={[style, { paddingRight: GAP }]}>{text}</Text>
        </Animated.View>
      ) : (
        <Text style={style} numberOfLines={1} onLayout={(e) => setTw(e.nativeEvent.layout.width)}>{text}</Text>
      )}
    </View>
  );
}

// Tier 1 — the full-bleed Spotlight billboard.
function SpotlightBillboard({ event, onPress, height }) {
  const status = eventStatus(event.startTime, event.endTime, event.market);
  const meta = [event.venueName, fmtDate(event.startTime, event.market)].filter(Boolean).join('   ·   ');
  return (
    <PressableScale onPress={() => onPress?.(event)} style={[styles.billboard, { height }]}>
      <PosterImage uri={event.imageUrl} style={StyleSheet.absoluteFill} />
      <Scrim colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.94)']} locations={[0, 0.5, 1]} />
      <View style={styles.billboardTop}>
        <View style={styles.spotlightTag}><Text style={styles.spotlightTagText}>◆  SPOTLIGHT</Text></View>
        <StatusBadge status={status} large />
      </View>
      <View style={styles.billboardBottom}>
        {event.category ? <GlassTag label={event.category.toUpperCase()} /> : null}
        <MarqueeText text={event.title} style={styles.billboardTitle} />
        <Text style={styles.billboardMeta} numberOfLines={1}>{meta}</Text>
      </View>
    </PressableScale>
  );
}

// Tier 2 — a magazine-cover stream card.
function PulseCard({ event, onPress }) {
  const status = eventStatus(event.startTime, event.endTime, event.market);
  const meta = [event.venueName, fmtDate(event.startTime, event.market)].filter(Boolean).join('   ·   ');
  return (
    <PressableScale onPress={() => onPress?.(event)} style={styles.card}>
      <PosterImage uri={event.imageUrl} style={styles.cardPoster} />
      <Scrim colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.9)']} locations={[0, 0.45, 1]} />
      <View style={styles.cardTop}>
        <StatusBadge status={status} />
        {event.isFeatured ? <View style={styles.boostTag}><Text style={styles.boostText}>★ BOOSTED</Text></View> : null}
      </View>
      <View style={styles.cardBottom}>
        {event.category ? <GlassTag label={event.category.toUpperCase()} style={styles.cardCatTag} /> : null}
        <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>{meta}</Text>
      </View>
    </PressableScale>
  );
}

export function DailyPulse({ market, cityLabel, onPressEvent }) {
  const { width } = useWindowDimensions();
  const { spotlight, stream, loading } = useDailyPulse(market);
  const { drops } = useDrops(market);
  const hasDrop = drops.length > 0;

  const header = (
    <View>
      <View style={styles.masthead}>
        <Text style={styles.kicker}>THE DAILY PULSE</Text>
        <Text style={styles.h1}>Tonight in {cityLabel ?? (market === 'ZW' ? 'Harare' : 'Algiers')}</Text>
      </View>
      {/* The 4Forty4 Drop takes the hero slot when one is running; otherwise the boosted
          Spotlight billboard leads. Never both, so the eye lands on a single anchor. */}
      {hasDrop ? (
        <InlineDrop market={market} />
      ) : spotlight ? (
        <SpotlightBillboard event={spotlight} onPress={onPressEvent} height={Math.round(width * 1.12)} />
      ) : null}
      {stream.length > 0 ? <Text style={styles.streamLabel}>UPCOMING</Text> : null}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={stream}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <PulseCard event={item} onPress={onPressEvent} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading
          ? <ActivityIndicator color={colors.accent} style={styles.loader} />
          : !spotlight
            ? <Text style={styles.empty}>No upcoming events yet. Check back soon.</Text>
            : null
      }
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
      // Perf: virtualization tuned for heavy poster graphics.
      initialNumToRender={3}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const CARD_H = 220;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  list: { paddingBottom: space.huge },
  loader: { marginTop: space.xxl },
  empty: { textAlign: 'center', marginTop: space.xxl, color: colors.textLo, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: space.xl },

  masthead: { paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.base },
  kicker: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 3 },
  h1: { color: colors.textHi, fontFamily: fonts.display, fontSize: 30, lineHeight: 36, marginTop: 4 },

  // Spotlight billboard
  billboard: { marginHorizontal: space.base, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated2, justifyContent: 'space-between' },
  billboardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: space.base },
  spotlightTag: {
    backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12,
    shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  spotlightTagText: { color: colors.onAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  billboardBottom: { padding: space.lg, gap: space.sm },
  billboardTitle: { color: '#fff', fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  billboardMeta: { color: 'rgba(255,255,255,0.82)', fontFamily: fonts.bodySemi, fontSize: 14 },

  marqueeWrap: { overflow: 'hidden' },
  marqueeRow: { flexDirection: 'row' },

  // Stream cards
  streamLabel: { color: colors.textMute, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2.5, marginTop: space.xl, marginBottom: space.md, marginHorizontal: space.base },
  card: { height: CARD_H, marginHorizontal: space.base, marginBottom: space.base, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated2, justifyContent: 'space-between' },
  cardPoster: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  posterFallback: { backgroundColor: colors.bgElevated2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: space.md },
  cardBottom: { padding: space.base, gap: 6 },
  cardCatTag: { marginBottom: 2 },
  cardTitle: { color: '#fff', fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
  cardMeta: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.bodySemi, fontSize: 13 },

  // Glass tag (glassmorphism-lite; upgrade to expo-blur BlurView)
  glassTag: { alignSelf: 'flex-start', backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, overflow: 'hidden' },
  glassTagText: { color: colors.textHi, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5 },

  // Status badges — the "neon"
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  statusLarge: { paddingVertical: 7, paddingHorizontal: 13 },
  statusText: { color: colors.textHi, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2 },
  statusSoon: { backgroundColor: colors.accent, borderColor: colors.accent },
  statusTextSoon: { color: colors.onAccent },
  statusLive: {
    backgroundColor: colors.danger, borderColor: colors.danger,
    shadowColor: colors.danger, shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  statusTextLive: { color: '#fff' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },

  // Boosted ribbon
  boostTag: { backgroundColor: 'rgba(240,181,74,0.18)', borderWidth: 1, borderColor: colors.star, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  boostText: { color: colors.star, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2 },
});
