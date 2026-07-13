import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ExperienceCard } from './ExperienceCard';
import { useReducedMotion, colors, space } from '../../lib/theme';

// Memoized slot: with the belt auto-advancing every few seconds, only the card whose props
// actually change should re-render — this silences the "large list slow to update" warning
// and keeps scrolling smooth. `item`, `onPressItem` and `onLayout` are all stable per row.
const ConveyorCard = React.memo(function ConveyorCard({ item, onPressItem, onLayout }) {
  return (
    <View style={styles.slot} onLayout={onLayout}>
      <ExperienceCard item={item} width={CARD_W} onPress={() => onPressItem?.(item)} />
    </View>
  );
});

// A standard, fully native, fully interactive horizontal belt. Cards drag, fling and TAP
// exactly like any FlatList — nothing is layered on top of the gesture system. The auto-
// movement is deliberately IDLE-BETWEEN-STEPS: every few seconds the belt glides one card
// forward (a single animated scroll) and then sits completely still. Because it is idle,
// not being driven every frame, touches are never fought — the previous continuous per-
// frame scroll is what swallowed taps and drags. A touch cancels the pending glide; the
// belt resumes a few seconds after the user goes idle, continuing from where they left it.
//
// Seamless loop: the imaged front is repeated many times and the belt starts mid-list; the
// step wraps by whole set-widths (identical content there, so the jump is invisible). The
// FlatList virtualizes, so only the on-screen window is ever mounted.
const CARD_W = 230;
const GAP = 12;
const STEP = CARD_W + GAP;        // one slot: card + trailing gap (matches getItemLayout)
const EST_H = 250;                // list height until the first card measures
const ADVANCE_MS = 3000;          // dwell on a card before gliding to the next
const RESUME_DELAY = 3000;        // ms of stillness before auto-advance resumes after a touch
const REPEATS = 8;                // copies of the belt -> endless-feeling scroll without a
                                  // huge mounted list (40 flooded the image loader -> cover
                                  // requests timed out; 8 still buffers ~4 sets each way)
const MAX_BELT = 12;              // distinct cards on the belt (kept modest; list virtualizes)
const LEAD = space.base;          // content inset so a resting card lines up with app margins (16)
const EDGE_FADE = 40;             // px of soft dissolve at each end (~10% of a phone width)

// A TRUE alpha dissolve, not a dark panel: fully opaque page-background at the very edge
// easing to 100% transparent toward the centre, so cards melt in/out of view. Same colour
// throughout (colors.bgBase = #0B1220 = rgb(11,18,32)); only the alpha changes, so there is
// no colour shift — it reads as the card dissolving, not sliding under a box.
const FADE_SOLID = colors.bgBase;
const FADE_MID = 'rgba(11,18,32,0.5)';
const FADE_CLEAR = 'rgba(11,18,32,0)';
const FADE_STOPS = [0, 0.5, 1];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const getItemLayout = (_, index) => ({ length: STEP, offset: STEP * index, index });

export function ShelfConveyor({ data, loopCount, onPressItem }) {
  const reduced = useReducedMotion();
  const total = data?.length ?? 0;
  const loop = clamp(loopCount ?? total, 0, total);
  const belt = useMemo(() => (data ?? []).slice(0, Math.min(loop, MAX_BELT)), [data, loop]);
  const animate = !reduced && belt.length >= 2;

  const listRef = useRef(null);
  const advanceTimer = useRef(null);
  const resumeTimer = useRef(null);
  const posX = useRef(0);            // current scroll offset (px)
  const drivingRef = useRef(false);  // true while the user owns the belt (touch/drag)
  const maxH = useRef(EST_H);
  const [stageH, setStageH] = useState(EST_H);

  const setWidth = belt.length * STEP;
  const startIndex = Math.floor(REPEATS / 2) * belt.length; // begin mid-list: room both ways
  const startOffset = startIndex * STEP;

  // Repeat the belt so the user can fling for ages without hitting an end.
  const listData = useMemo(() => {
    if (!animate) return (data ?? []).map((it, i) => ({ it, key: `${it.kind}-${it.id}-${i}` }));
    const out = [];
    for (let c = 0; c < REPEATS; c += 1) {
      for (let i = 0; i < belt.length; i += 1) {
        const it = belt[i];
        out.push({ it, key: `${c}-${it.kind}-${it.id}` });
      }
    }
    return out;
  }, [animate, data, belt]);

  // --- auto-advance (idle between glides) ---------------------------------
  const clearTimers = () => {
    if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null; }
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  };

  // One gentle glide to the next card, then queue the next glide. Runs only when the belt
  // is idle, so it never competes with a live gesture.
  const tick = () => {
    let next = posX.current + STEP;
    // Near the tail: hop back a whole number of sets (invisible — content repeats), then step.
    if (next >= (REPEATS - 1) * setWidth) {
      posX.current -= (REPEATS - 2) * setWidth;
      listRef.current?.scrollToOffset({ offset: posX.current, animated: false });
      next = posX.current + STEP;
    }
    posX.current = next;
    listRef.current?.scrollToOffset({ offset: next, animated: true });
    advanceTimer.current = setTimeout(tick, ADVANCE_MS);
  };
  const startAuto = () => {
    if (!animate || setWidth === 0) return;
    drivingRef.current = false;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(tick, ADVANCE_MS);
  };

  // The user takes over: stop everything so scrolling/tapping is purely native.
  const grabByUser = () => {
    drivingRef.current = true;
    clearTimers();
  };
  const scheduleResume = () => {
    if (!animate) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(startAuto, RESUME_DELAY);
  };

  // Keep posX synced to the live offset while the user drives, so the next glide continues
  // from exactly where they released instead of snapping back.
  const onScroll = (e) => { if (drivingRef.current) posX.current = e.nativeEvent.contentOffset.x; };

  useEffect(() => {
    if (!animate || setWidth === 0) return undefined;
    posX.current = startOffset;
    startAuto();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, setWidth]);

  // Hooks must run every render — keep them ABOVE the early return below.
  const onSlotLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height;
    if (h > maxH.current) { maxH.current = h; setStageH(h); }
  }, []);
  const renderItem = useCallback(
    ({ item }) => <ConveyorCard item={item.it} onPressItem={onPressItem} onLayout={onSlotLayout} />,
    [onPressItem, onSlotLayout],
  );

  if (total === 0) return null;

  const list = (
    <FlatList
      ref={listRef}
      data={listData}
      keyExtractor={(it) => it.key}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="normal"
      scrollEventThrottle={16}
      style={{ height: stageH }}
      contentContainerStyle={styles.beltContent}
      // Keep only a small window mounted. Every shelf lives in the (un-virtualized) list
      // header, so without these caps all shelves mount ~30 cards each at once and flood
      // the image loader -> cover fetches time out. Only ~2 cards are ever on screen.
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={3}
      {...(animate ? {
        initialScrollIndex: startIndex,
        onScroll,
        // Free while touched; auto-advance resumes on release after an idle beat.
        onTouchStart: grabByUser,
        onScrollBeginDrag: grabByUser,
        onScrollEndDrag: scheduleResume,
        onMomentumScrollEnd: scheduleResume,
        onTouchEnd: scheduleResume,
        onScrollToIndexFailed: ({ index }) => listRef.current?.scrollToOffset({ offset: index * STEP, animated: false }),
      } : {})}
    />
  );

  if (!animate) return <View style={styles.stage}>{list}</View>;

  // Full-bleed belt on the page background; the two edge masks are the only framing.
  return (
    <View style={styles.stage}>
      {list}
      <LinearGradient
        pointerEvents="none"
        colors={[FADE_SOLID, FADE_MID, FADE_CLEAR]}
        locations={FADE_STOPS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fade, styles.fadeLeft]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[FADE_CLEAR, FADE_MID, FADE_SOLID]}
        locations={FADE_STOPS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fade, styles.fadeRight]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Full width (outer container width is NOT restricted) so cards run to the edges and
  // dissolve there; only vertical breathing room is added here.
  stage: { position: 'relative', paddingVertical: space.sm },
  beltContent: { paddingHorizontal: LEAD },
  fade: { position: 'absolute', top: 0, bottom: 0, width: EDGE_FADE },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  slot: { width: CARD_W, marginRight: GAP },
});
