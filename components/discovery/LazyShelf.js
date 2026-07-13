import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, Animated } from 'react-native';
import { useReducedMotion } from '../../lib/theme';

// Two reveal thresholds in the list's CONTENT coordinate space, both raised monotonically by
// DiscoveryList as the user scrolls:
//   • mountY — buffered (a screen ahead): the shelf mounts here so its covers preload while
//     still off-screen.
//   • showY  — the actual viewport bottom: the shelf's entrance fade plays here, as it truly
//     scrolls into view (not early, off-screen, where the fade would be wasted).
// Default Infinity/Infinity = "mount and show immediately" — a safe no-op outside a
// DiscoveryList (e.g. another screen), so nothing is ever hidden by accident.
export const ShelfRevealContext = createContext({ mountY: Infinity, showY: Infinity });

// Defers an image-heavy shelf until it's near the fold, then fades it gently in as it enters
// the viewport. Once mounted it never unmounts; once shown it stays shown. An empty shelf
// collapses to nothing (its children render null) — off-screen, so no gap or jump is seen.
export function LazyShelf({ estHeight = 300, children }) {
  const { mountY, showY } = useContext(ShelfRevealContext);
  const reduced = useReducedMotion();
  const [y, setY] = useState(null);          // our top, measured in content space
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  // Track our top from the spacer's layout; functional update no-ops when unchanged so a
  // shift above (a collapsing empty shelf) keeps the thresholds accurate without extra renders.
  const onLayout = (e) => {
    const ny = e.nativeEvent.layout.y;
    setY((prev) => (prev === ny ? prev : ny));
  };

  useEffect(() => {
    if (!mounted && y != null && y <= mountY) setMounted(true);
  }, [mounted, y, mountY]);

  useEffect(() => {
    if (mounted && !shown && y != null && y <= showY) setShown(true);
  }, [mounted, shown, y, showY]);

  useEffect(() => {
    if (shown && !reduced) {
      Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    }
  }, [shown, reduced, fade]);

  if (!mounted) return <View style={{ height: estHeight }} onLayout={onLayout} />;
  // Mounted but not yet in view: rendered at opacity 0 (covers loading), then fades in on entry.
  return <Animated.View style={{ opacity: reduced ? 1 : fade }} onLayout={onLayout}>{children}</Animated.View>;
}
