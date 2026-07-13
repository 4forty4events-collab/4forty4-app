import React from 'react';
import { ScrollView, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CATEGORY_COLORS } from '../../lib/categories';
import { AppText, colors, space, radius } from '../../lib/theme';

// "Explore by Vibe" — mood-first browsing that replaces the raw category rail. Each tile is a
// gradient chip (category colour → deep night) with an emoji + evocative label; tapping opens
// the immersive Feed filtered to that category. Presentation only; the label is friendlier
// than the slug, but each maps to a real catalogue category.
const VIBES = [
  { category: 'cafe', emoji: '☕', label: 'Coffee' },
  { category: 'restaurant', emoji: '🍽️', label: 'Eats' },
  { category: 'music_event', emoji: '🎶', label: 'Live Music' },
  { category: 'culture', emoji: '🏛️', label: 'Culture' },
  { category: 'outdoor', emoji: '🌿', label: 'Outdoors' },
  { category: 'nightlife', emoji: '🌙', label: 'Nightlife' },
  { category: 'shopping', emoji: '🛍️', label: 'Shopping' },
];

export function VibeCollections({ onPick }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {VIBES.map((v) => {
        const c = CATEGORY_COLORS[v.category] ?? CATEGORY_COLORS.other;
        return (
          <Pressable key={v.category} style={styles.card} onPress={() => onPick(v.category)} accessibilityRole="button" accessibilityLabel={v.label}>
            <LinearGradient colors={[c, 'rgba(11,18,32,0.55)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <AppText style={styles.emoji}>{v.emoji}</AppText>
            <AppText variant="bodySemi" color={colors.textHi}>{v.label}</AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.base, gap: space.sm },
  card: { width: 132, height: 92, borderRadius: radius.lg, overflow: 'hidden', padding: space.md, justifyContent: 'flex-end', gap: 2 },
  emoji: { fontSize: 24 },
});
