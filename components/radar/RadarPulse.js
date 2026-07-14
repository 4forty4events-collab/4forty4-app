import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion, colors } from '../../lib/theme';

// The Radar signature mark: sonar rings expanding out of a target core, on a loop.
// Reusable at any size (feed card, profile row, modal hero). Honors reduce-motion
// (renders a static target instead) and uses the native driver so it's cheap.
const DURATION = 1800;

export function RadarPulse({ size = 56, color = colors.accent, rings = 3 }) {
  const reduced = useReducedMotion();
  const anims = useRef(Array.from({ length: rings }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduced) return undefined;
    // Stagger each ring by an even slice of the cycle so they ripple outward.
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i * DURATION) / rings),
          Animated.timing(v, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduced, rings, anims]);

  const core = Math.round(size * 0.46);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {!reduced && anims.map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[styles.ring, {
            width: size, height: size, borderRadius: size / 2, borderColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }]}
        />
      ))}
      {reduced && (
        <View pointerEvents="none" style={[styles.ring, styles.ringStatic, { width: size * 0.84, height: size * 0.84, borderRadius: size, borderColor: color }]} />
      )}

      {/* Target core — the warm anchor the rings emanate from. */}
      <View style={[styles.core, { width: core, height: core, borderRadius: core / 2, backgroundColor: color }]}>
        <Svg width={core * 0.64} height={core * 0.64} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} stroke={colors.onAccent} strokeWidth={1.6} fill="none" />
          <Circle cx={12} cy={12} r={4.6} stroke={colors.onAccent} strokeWidth={1.6} fill="none" />
          <Circle cx={12} cy={12} r={1.7} fill={colors.onAccent} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  ringStatic: { opacity: 0.4 },
  core: { alignItems: 'center', justifyContent: 'center' },
});
