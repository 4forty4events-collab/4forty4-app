import React, { useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ExperienceCard } from './ExperienceCard';
import { PosterCard } from './PosterCard';
import { useReducedMotion, colors, space } from '../../lib/theme';

// A static, Netflix-style horizontal row: manual swipe only, native momentum + snap, and a
// subtle scroll-linked scale so the leading card sits a hair larger than its neighbours
// (premium "focus" feel, not a moving belt). NO auto-scroll — motion on Discover is reserved
// for the Featured hero. Cards are fully interactive; the scale runs on the native driver so
// scrolling stays at 60fps, and it's disabled entirely under reduce-motion. Edges keep the
// soft alpha dissolve so cards melt in/out rather than hard-clipping.
//
// `variant` swaps the card treatment (and its width) without changing any of the row
// mechanics: `default` standard cards, `poster` tall Trending posters, `new` cards with a
// NEW badge. STEP (snap + layout stride) derives from the variant's width.
const GAP = 12;
const LEAD = space.base;            // content inset so a resting card lines up with app margins
const EDGE_FADE = 40;
const FADE_SOLID = colors.bgBase;
const FADE_MID = 'rgba(11,18,32,0.5)';
const FADE_CLEAR = 'rgba(11,18,32,0)';
const FADE_STOPS = [0, 0.5, 1];

const VARIANTS = {
  default: { width: 230, render: (item, onPress) => <ExperienceCard item={item} width={230} onPress={onPress} /> },
  poster: { width: 158, render: (item, onPress) => <PosterCard item={item} width={158} onPress={onPress} /> },
  new: { width: 190, render: (item, onPress) => <ExperienceCard item={item} width={190} onPress={onPress} badge="NEW" /> },
};

export function ShelfRow({ data, onPressItem, variant = 'default' }) {
  const reduced = useReducedMotion();
  const scrollX = useRef(new Animated.Value(0)).current;

  if (!data?.length) return null;

  const spec = VARIANTS[variant] ?? VARIANTS.default;
  const CARD_W = spec.width;
  const STEP = CARD_W + GAP;

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  );

  const renderItem = ({ item, index }) => {
    // Card `index` settles at scrollX = index*STEP (its left at the app margin); it reads full
    // size there and eases to 0.97 as it drifts half a slot away. Subtle, native-driven.
    const scale = reduced
      ? 1
      : scrollX.interpolate({
          inputRange: [(index - 1) * STEP, index * STEP, (index + 1) * STEP],
          outputRange: [0.97, 1, 0.97],
          extrapolate: 'clamp',
        });
    return (
      <Animated.View style={[{ width: CARD_W, marginRight: GAP }, { transform: [{ scale }] }]}>
        {spec.render(item, () => onPressItem?.(item))}
      </Animated.View>
    );
  };

  return (
    <View style={styles.stage}>
      <Animated.FlatList
        data={data}
        keyExtractor={(it, i) => `${it.kind}-${it.id}-${i}`}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: STEP, offset: STEP * index, index })}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="normal"
        snapToInterval={STEP}
        snapToAlignment="start"
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
      />
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
  stage: { position: 'relative', paddingVertical: space.sm },
  content: { paddingHorizontal: LEAD },
  fade: { position: 'absolute', top: 0, bottom: 0, width: EDGE_FADE },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
});
