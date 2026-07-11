import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, useWindowDimensions, StyleSheet } from 'react-native';
import { useDrops, useDrop } from '../../lib/discovery/hooks/useDrops';
import { DropHero } from './DropHero';
import { colors, space, useReducedMotion } from '../../lib/theme';

const AUTO_MS = 5000;   // dwell per drop before auto-advancing
const RESUME_MS = 8000; // idle time after a manual swipe before auto-advance resumes
const PEEK = 22;        // how much of the neighbouring card pokes into view
const GAP = 12;         // gap between cards

// One carousel page. Each owns its full lifecycle via useDrop (countdown + realtime +
// claim), so swiping between drops keeps every meter and clock independently live.
function DropCard({ drop, cardWidth, flush, marginRight }) {
  const state = useDrop(drop);
  return (
    <View style={{ width: cardWidth, marginRight }}>
      <DropHero state={state} flush={flush} />
    </View>
  );
}

// The 4Forty4 Drop as a full-width hero when solo, or a peeking, auto-rotating snap
// carousel when there are several — the next card's edge always shows, so it reads as
// swipeable at a glance. Auto-advance pauses under touch and resumes after idle.
export function InlineDrop({ market }) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { drops, loading } = useDrops(market);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const listRef = useRef(null);
  const indexRef = useRef(0);
  const resumeTimer = useRef(null);

  const CARD_W = width - 2 * PEEK - GAP; // active card; leaves a PEEK sliver each side
  const INTERVAL = CARD_W + GAP;         // snap + layout stride

  // Auto-advance loop. Pauses under user interaction and for reduce-motion.
  useEffect(() => {
    if (reduced || paused || drops.length <= 1) return undefined;
    const id = setInterval(() => {
      const next = (indexRef.current + 1) % drops.length;
      indexRef.current = next;
      setIndex(next);
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [reduced, paused, drops.length]);

  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  // Keep index valid if the drop list shrinks.
  useEffect(() => {
    if (index > drops.length - 1) { indexRef.current = 0; setIndex(0); }
  }, [drops.length, index]);

  if (loading || drops.length === 0) return null;
  // Solo drop: keep the original full-width look (its own side gutters intact).
  if (drops.length === 1) return <DropCard drop={drops[0]} cardWidth={width} flush={false} marginRight={0} />;

  const pauseForInteraction = () => {
    setPaused(true);
    clearTimeout(resumeTimer.current);
  };
  const scheduleResume = () => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_MS);
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        data={drops}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => <DropCard drop={item} cardWidth={CARD_W} flush marginRight={GAP} />}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Peeking snap: card + gap is the stride; a PEEK gutter centres the active card.
        snapToInterval={INTERVAL}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: PEEK }}
        getItemLayout={(_, i) => ({ length: INTERVAL, offset: INTERVAL * i, index: i })}
        onScrollBeginDrag={pauseForInteraction}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / INTERVAL);
          indexRef.current = i;
          setIndex(i);
          scheduleResume(); // resume auto-rotation after the user idles
        }}
        // Heavy immersive pages: keep only what's near the viewport mounted.
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
      />
      <View style={styles.dots}>
        {drops.map((d, i) => (
          <View key={d.id} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: -space.sm, marginBottom: space.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { width: 20, backgroundColor: colors.accent },
});
