import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Animated, Easing, StyleSheet } from 'react-native';
import { ExperienceCard } from './ExperienceCard';
import { useReducedMotion, space } from '../../lib/theme';

// TRUE seamless infinite conveyor. The imaged front of the shelf is laid out as ONE
// continuous row that drifts right→left at a constant speed and wraps with zero gap:
//
//   • The row is rendered as >= 2 back-to-back COPIES of the card set. Its width is a
//     whole number of set-widths, so the whole thing repeats every `setWidth` px.
//   • A single linear animation translates the row left by exactly one `setWidth`, on
//     a loop. When it resets, the pixels are identical to the start (the next copy is
//     already there) — so the wrap is invisible and there is never an empty/"waiting"
//     slot. Every card is always fully mounted and fully opaque: no dwell, no fade,
//     no anchor hand-off.
//   • Touch pauses the belt (so a moving card is easy to tap) and it RESUMES from the
//     exact position it stopped at — never a jump — after a short beat.
//
// Reduced-motion or a shelf with < 2 imaged cards falls back to a plain static row.
const CARD_W = 230;               // shelf tile width (two cards peek per row)
const GAP = 12;                   // gap between tiles
const STEP = CARD_W + GAP;        // one slot: card + gap
const EST_H = 250;                // stage height until the first card measures
const SPEED = 45;                 // px / second — calm, premium drift
const RESUME_DELAY = 2500;        // ms of stillness before the belt resumes after a touch
const MAX_BELT = 10;              // cap the distinct cards on the belt (<= 2 copies mounted)

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export function ShelfConveyor({ data, loopCount, onPressItem }) {
  const reduced = useReducedMotion();
  const total = data?.length ?? 0;
  // The belt cycles through the imaged front only (image-less placeholders are sorted
  // to the tail upstream); cap the count so we never mount an unreasonable number.
  const loop = clamp(loopCount ?? total, 0, total);
  const belt = (data ?? []).slice(0, Math.min(loop, MAX_BELT));
  const animate = !reduced && belt.length >= 2;

  const [containerW, setContainerW] = useState(0);
  const [stageH, setStageH] = useState(EST_H);

  const offset = useRef(new Animated.Value(0)).current;
  const offsetVal = useRef(0);       // last-known position, captured on pause
  const running = useRef(null);      // the current Animated composite
  const resumeTimer = useRef(null);
  const maxH = useRef(EST_H);

  const setWidth = belt.length * STEP;                 // one full card set
  const fullDuration = (setWidth / SPEED) * 1000;      // constant speed, any belt length
  // Enough copies that the row always overflows the viewport by a full set (so content
  // exists at every offset in [0, -setWidth]); >= 2 guarantees the seamless wrap.
  const copies = setWidth > 0
    ? Math.max(2, containerW > 0 ? Math.ceil(containerW / setWidth) + 1 : 2)
    : 0;

  // Geometry the pause/resume handlers read (kept in a ref so those closures never go
  // stale as data changes).
  const geom = useRef({ setWidth, fullDuration });
  geom.current = { setWidth, fullDuration };

  const startLoop = () => {
    const g = geom.current;
    if (!g.setWidth) return;
    offset.setValue(0);
    const anim = Animated.loop(
      Animated.timing(offset, {
        toValue: -g.setWidth, duration: g.fullDuration, easing: Easing.linear, useNativeDriver: true,
      }),
    );
    running.current = anim;
    anim.start();
  };

  // Continue from the captured position to the set boundary, then hand back to the
  // full loop — so a pause/resume never snaps the belt.
  const resumeLoop = () => {
    const g = geom.current;
    if (!g.setWidth) return;
    const remaining = g.setWidth + offsetVal.current; // offset is negative, in (-setWidth, 0]
    if (remaining <= 0.5) { startLoop(); return; }
    const anim = Animated.timing(offset, {
      toValue: -g.setWidth, duration: (remaining / SPEED) * 1000, easing: Easing.linear, useNativeDriver: true,
    });
    running.current = anim;
    anim.start(({ finished }) => { if (finished) startLoop(); });
  };

  const pauseNow = () => {
    if (!animate) return;
    // stopAnimation both halts the belt AND reports the exact current offset.
    offset.stopAnimation((v) => { offsetVal.current = v; });
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  };
  const scheduleResume = () => {
    if (!animate) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(resumeLoop, RESUME_DELAY);
  };

  // (Re)start the belt whenever the geometry settles or changes.
  useEffect(() => {
    if (!animate || containerW === 0 || setWidth === 0) return undefined;
    startLoop();
    return () => {
      offset.stopAnimation();
      if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, containerW, setWidth, fullDuration]);

  if (total === 0) return null;

  // Reduced-motion or too few imaged cards → a plain, static, manually scrollable row
  // (no motion), which also keeps every placeholder reachable.
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

  // The continuous row: `copies` back-to-back sets, every card the same fixed slot so
  // spacing (and therefore the wrap) is perfectly uniform.
  const cards = [];
  for (let c = 0; c < copies; c += 1) {
    for (let i = 0; i < belt.length; i += 1) {
      const item = belt[i];
      cards.push(
        <View
          key={`${c}-${item.kind}-${item.id}`}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > maxH.current) { maxH.current = h; setStageH(h); }
          }}
          style={styles.slot}
        >
          <ExperienceCard item={item} width={CARD_W} onPress={() => onPressItem?.(item)} />
        </View>,
      );
    }
  }

  return (
    <View
      style={[styles.stage, { height: stageH }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w && Math.abs(w - containerW) > 1) setContainerW(w);
      }}
      onTouchStart={pauseNow}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
    >
      <Animated.View style={[styles.belt, { transform: [{ translateX: offset }] }]}>
        {cards}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.base },
  stage: { marginHorizontal: space.base, overflow: 'hidden' },
  belt: { flexDirection: 'row', alignItems: 'flex-start' },
  // Fixed slot = card width + trailing gap, so every gap (including the seam between
  // copies) is exactly GAP and the loop wraps with no jump.
  slot: { width: CARD_W, marginRight: GAP },
});
