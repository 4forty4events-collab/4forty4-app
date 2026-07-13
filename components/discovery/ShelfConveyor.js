import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { ExperienceCard } from './ExperienceCard';
import { useReducedMotion, colors, radius, space } from '../../lib/theme';

// A real, fully SCROLLABLE conveyor: a horizontal FlatList the user can drag/swipe/
// fling at will, with a gentle auto-scroll layered on top. Any touch pauses the auto-
// scroll and hands full control to the user; it resumes from wherever they left off a
// beat after they let go. The list is the imaged front repeated many times and started
// in the middle, so it reads as endless in both directions; the auto pass wraps by a
// whole number of set-widths (seamless — the repeated content is identical there).
//
// The auto pass is a slow, time-stepped scrollToOffset (native scroll physics stay
// intact for the user); ~18 px/s glides past like a quiet stream rather than a belt.
const CARD_W = 230;
const GAP = 12;
const STEP = CARD_W + GAP;        // one slot: card + trailing gap (matches getItemLayout)
const EST_H = 250;                // list height until the first card measures
const SPEED = 18;                 // px / second — subtle, elegant drift
const AUTO_MS = 33;               // ~30fps auto-scroll tick (bounded JS work per shelf)
const RESUME_DELAY = 2500;        // ms of stillness before auto-scroll resumes after a touch
const REPEATS = 40;               // copies of the belt -> effectively endless manual scroll
const MAX_BELT = 12;              // distinct cards on the belt (kept modest; list virtualizes)

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const getItemLayout = (_, index) => ({ length: STEP, offset: STEP * index, index });

export function ShelfConveyor({ data, loopCount, onPressItem }) {
  const reduced = useReducedMotion();
  const total = data?.length ?? 0;
  const loop = clamp(loopCount ?? total, 0, total);
  const belt = useMemo(() => (data ?? []).slice(0, Math.min(loop, MAX_BELT)), [data, loop]);
  const animate = !reduced && belt.length >= 2;

  const listRef = useRef(null);
  const timer = useRef(null);        // auto-scroll interval
  const resumeTimer = useRef(null);
  const posX = useRef(0);            // current scroll offset (px)
  const pausedRef = useRef(false);
  const maxH = useRef(EST_H);
  const [stageH, setStageH] = useState(EST_H);

  const setWidth = belt.length * STEP;
  const startIndex = Math.floor(REPEATS / 2) * belt.length; // begin mid-list: room both ways
  const startOffset = startIndex * STEP;

  // Repeat the belt so the user can fling for ages without hitting an end; the FlatList
  // virtualizes, so only the on-screen window is ever mounted regardless of REPEATS.
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

  const stopAuto = () => {
    pausedRef.current = true;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  };
  const startAuto = () => {
    if (!animate || setWidth === 0) return;
    pausedRef.current = false;
    if (timer.current) clearInterval(timer.current);
    const stepPx = SPEED * (AUTO_MS / 1000);
    timer.current = setInterval(() => {
      posX.current += stepPx;
      // Wrap back a whole number of sets before the tail — invisible, content repeats.
      if (posX.current >= (REPEATS - 1) * setWidth) posX.current -= (REPEATS - 2) * setWidth;
      listRef.current?.scrollToOffset({ offset: posX.current, animated: false });
    }, AUTO_MS);
  };

  const pauseNow = () => {
    if (!animate) return;
    stopAuto();
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  };
  const scheduleResume = () => {
    if (!animate) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(startAuto, RESUME_DELAY);
  };

  // Track the live offset only while the user is driving, so auto-scroll resumes from
  // exactly where they released rather than snapping back.
  const onScroll = (e) => {
    if (pausedRef.current) posX.current = e.nativeEvent.contentOffset.x;
  };

  useEffect(() => {
    if (!animate || setWidth === 0) return undefined;
    posX.current = startOffset;
    startAuto();
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, setWidth]);

  if (total === 0) return null;

  const renderItem = ({ item }) => (
    <View
      style={styles.slot}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > maxH.current) { maxH.current = h; setStageH(h); }
      }}
    >
      <ExperienceCard item={item.it} width={CARD_W} onPress={() => onPressItem?.(item.it)} />
    </View>
  );

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
      style={{ height: stageH }}
      // Auto-scroll + pause/resume are only wired when we actually animate.
      {...(animate ? {
        initialScrollIndex: startIndex,
        onScroll,
        scrollEventThrottle: 16,
        onScrollBeginDrag: pauseNow,
        onScrollEndDrag: scheduleResume,
        onMomentumScrollEnd: scheduleResume,
        onScrollToIndexFailed: ({ index }) => listRef.current?.scrollToOffset({ offset: index * STEP, animated: false }),
      } : {})}
    />
  );

  // Premium glass frame: a soft translucent deck behind the row with a hairline edge
  // and rounded corners (on this dark theme a fine border reads cleaner than a shadow).
  // onTouchStart pauses the instant a finger lands (even before a drag registers).
  return (
    <View
      style={styles.frame}
      onTouchStart={pauseNow}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
    >
      {list}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: space.base,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,             // inset the row from the glass edge
    borderRadius: radius.xl,
    backgroundColor: colors.glass,           // subtle glassmorphism tint
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,         // fine, elegant edge
    overflow: 'hidden',                       // clip the row to the rounded corners
  },
  slot: { width: CARD_W, marginRight: GAP },
});
