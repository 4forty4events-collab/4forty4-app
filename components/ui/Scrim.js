import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../lib/theme';

// The 3-stop bottom-up scrim that lets text sit legibly over full-bleed photography
// (feed items + venue hero). Absolute-filled by default; override via `style`.
// `height` limits it to the lower portion when the image should stay clean up top.
export function Scrim({ style, colors: stops, locations, pointerEvents = 'none' }) {
  return (
    <LinearGradient
      pointerEvents={pointerEvents}
      colors={stops ?? [colors.scrimTop, colors.scrimMid, colors.scrimBottom]}
      locations={locations ?? [0, 0.55, 1]}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}
