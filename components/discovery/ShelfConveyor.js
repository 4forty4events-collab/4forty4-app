import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, FlatList, Animated, PanResponder, Easing, StyleSheet } from 'react-native';
import { ExperienceCard } from './ExperienceCard';
import { useReducedMotion, colors, radius, space } from '../../lib/theme';

// The shelf's passive motion — a STATIC-ANCHOR CONVEYOR (replaces the old opacity
// cross-dissolve, which blinked the whole row to zero). The choreography:
//
//   • The far-left slot is a fixed anchor: it never slides away, so its name / rating
//     / price stay perfectly readable.
//   • The cards to its right form a conveyor belt drifting right→left.
//   • On each beat the belt's leading card glides LEFT and layers directly on top of
//     the anchor slot; the card beneath dissolves out as it's covered, and the card
//     that just landed becomes the new anchor. The next belt card slides up into the
//     second column behind it. Nothing ever hides/flashes — every visible card is
//     always on screen; only its role and position change.
//
// Flash-free hand-off: a small WINDOW of cards is mounted, keyed by item id. When the
// belt advances, the card that covered the anchor keeps its exact element and simply
// becomes the new anchor (same id, same x=0), so no content ever swaps mid-frame.
//
// The passive loop is bounded to `loopCount` (the image-bearing front of the list),
// so image-less placeholders — sorted to the tail upstream — never auto-surface. Any
// touch/drag kills the passive loop instantly and hands over manual control.
const CARD_W = 230;          // matches the shelf tile width (two cards peek per row)
const GAP = 12;              // matches the row's separator
const STEP = CARD_W + GAP;   // one belt slot: card width + gap
const EST_H = 250;           // stage height until the first real card measures
const WINDOW = 3;            // anchor + 2 belt cards (extra belt card enters off-screen)
const DWELL = 4600;          // ms the stage holds perfectly still (anchor readable)
const SLIDE = 1200;          // ms of the slide-over / cover glide
const RESUME_DELAY = 3000;   // ms of stillness before the passive loop resumes

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export function ShelfConveyor({ data, loopCount, onPressItem }) {
  const reduced = useReducedMotion();
  const total = data?.length ?? 0;
  // Passive motion cycles only through the imaged front; never past it.
  const loop = clamp(loopCount ?? total, 0, total);
  const windowSize = Math.min(WINDOW, loop);
  const animate = !reduced && loop >= 2;

  const [top, setTop] = useState(0);
  const [stageH, setStageH] = useState(EST_H);
  const drift = useRef(new Animated.Value(0)).current; // 0 = resting, 1 = belt advanced one slot

  const paused = useRef(false);
  const resumeTimer = useRef(null);
  const runningAnim = useRef(null);
  const maxH = useRef(EST_H);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  // Advance the anchor to the next imaged card and reset the belt. The window is keyed
  // by item id, so the card that just covered the anchor keeps its element and becomes
  // the new anchor at the same x — nothing content-swaps, so there's never a flash.
  const commit = () => {
    // Advance the anchor ONLY. Do NOT reset `drift` here: setTop re-renders on the
    // next tick, but drift.setValue is immediate, so resetting now applies to the
    // CURRENT (pre-advance) render for one frame — the belt snaps back a slot and the
    // anchor flashes to full opacity. That one-frame rewind is the blink. The reset is
    // deferred to a layout effect keyed on `top` (below) so it lands in the SAME commit
    // as the new anchor, before paint — a seamless hand-off.
    setTop((t) => (loopRef.current ? (t + 1) % loopRef.current : 0));
  };

  // Reset the belt the instant the advanced `top` renders (before paint), so drift=0
  // is applied together with the new anchor rather than a frame early. This is what
  // removes the tail-of-slide flash/blink; the ending frame (old top, drift=1) and the
  // new resting frame (new top, drift=0) are pixel-identical for every visible card,
  // so with no stale intermediate frame the loop reads as one continuous slide.
  useLayoutEffect(() => {
    drift.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  const pauseNow = () => {
    paused.current = true;
    runningAnim.current?.stop?.();
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  };
  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { paused.current = false; }, RESUME_DELAY);
  };

  // Passive loop: hold (dwell) → slide the belt one slot (cover) → commit → repeat.
  useEffect(() => {
    if (!animate) return undefined;
    let cancelled = false;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        if (paused.current) { schedule(); return; } // wait out a manual pause
        const anim = Animated.timing(drift, {
          toValue: 1, duration: SLIDE, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
        });
        runningAnim.current = anim;
        anim.start(({ finished }) => {
          if (cancelled) return;
          if (finished) commit();
          schedule();
        });
      }, DWELL);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      runningAnim.current?.stop?.();
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, loop, windowSize]);

  // Manual control: a horizontal drag scrubs the cover. Past the threshold it commits
  // (advances a card); short of it, snaps back. Reads STEP (a fixed constant), so the
  // responder is created once and never goes stale.
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderGrant: pauseNow,
    onPanResponderMove: (_, g) => { drift.setValue(clamp(-g.dx / STEP, 0, 1)); },
    onPanResponderRelease: (_, g) => {
      const p = clamp(-g.dx / STEP, 0, 1);
      const doCommit = p > 0.35 || g.vx < -0.5;
      Animated.timing(drift, {
        toValue: doCommit ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (finished && doCommit) commit(); scheduleResume(); });
    },
    onPanResponderTerminate: scheduleResume,
  })).current;

  if (total === 0) return null;

  // Reduced-motion or a shelf with too few imaged cards → a plain, static, manually
  // scrollable row (no motion at all), which also keeps every placeholder reachable.
  if (!animate) {
    return (
      <FlatList
        data={data}
        keyExtractor={(it) => `${it.kind}-${it.id}`}
        renderItem={({ item }) => (
          <ExperienceCard item={item} width={CARD_W} onPress={() => onPressItem?.(item)} />
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
      />
    );
  }

  const slots = Array.from({ length: windowSize }, (_, k) => (top + k) % loop);

  return (
    <View
      style={[styles.stage, { height: stageH }]}
      onTouchStart={pauseNow}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
      {...pan.panHandlers}
    >
      {slots.map((idx, k) => {
        const item = data[idx];
        const isAnchor = k === 0;
        // The anchor stays pinned at x=0; every belt card sits k slots to the right and
        // glides one slot left as the belt advances (its k=1 leader lands on the anchor).
        const translateX = isAnchor
          ? 0
          : drift.interpolate({ inputRange: [0, 1], outputRange: [k * STEP, (k - 1) * STEP] });
        // Only the anchor changes opacity — it dissolves out over the last of the slide,
        // as the covering card lands on top. Belt cards stay fully opaque throughout.
        const opacity = isAnchor
          ? drift.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 1, 0.12] })
          : 1;
        // Covering card (k=1) rides above the anchor; the trailing belt card sits below.
        const zIndex = k === 1 ? 3 : (isAnchor ? 1 : 2);
        return (
          <Animated.View
            key={`${item.kind}-${item.id}`}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > maxH.current) { maxH.current = h; setStageH(h); }
            }}
            style={[styles.layer, { zIndex, opacity, transform: [{ translateX }] }]}
          >
            <ExperienceCard item={item} width={CARD_W} onPress={() => onPressItem?.(item)} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.base },
  stage: { position: 'relative', marginHorizontal: space.base, overflow: 'hidden' },
  layer: {
    position: 'absolute', top: 0, left: 0, width: CARD_W, borderRadius: radius.lg,
    // Left-edge shadow so a covering card reads as sliding OVER the one beneath it.
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: -6, height: 0 }, elevation: 8,
    backgroundColor: colors.bgElevated,
  },
});
