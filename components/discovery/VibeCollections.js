import React from 'react';
import { ScrollView, Pressable, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText, colors, space, radius } from '../../lib/theme';

// "Explore by Vibe" — mood-first browsing that replaces the raw category rail. Each tile is a
// relatable photo for the category under a soft dark gradient, with an emoji + evocative label;
// tapping opens the immersive Feed filtered to that category. The label is friendlier than the
// slug, but each maps to a real catalogue category.
const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=600&q=80&auto=format&fit=crop`;
const VIBES = [
  { category: 'cafe', emoji: '☕', label: 'Coffee', img: IMG('1495474472287-4d71bcdd2085') },
  { category: 'restaurant', emoji: '🍽️', label: 'Eats', img: IMG('1504674900247-0877df9cc836') },
  { category: 'music_event', emoji: '🎶', label: 'Live Music', img: IMG('1470229722913-7c0e2dbbafd3') },
  { category: 'culture', emoji: '🏛️', label: 'Culture', img: IMG('1518998053901-5348d3961a04') },
  { category: 'outdoor', emoji: '🌿', label: 'Outdoors', img: IMG('1441974231531-c6227db76b6e') },
  { category: 'nightlife', emoji: '🌙', label: 'Nightlife', img: IMG('1516450360452-9312f5e86fc7') },
  { category: 'shopping', emoji: '🛍️', label: 'Shopping', img: IMG('1441986300917-64674bd600d8') },
];

export function VibeCollections({ onPick }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {VIBES.map((v) => (
        <Pressable key={v.category} style={styles.card} onPress={() => onPick(v.category)} accessibilityRole="button" accessibilityLabel={v.label}>
          <Image source={{ uri: v.img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={['rgba(11,18,32,0.12)', 'rgba(11,18,32,0.88)']} style={StyleSheet.absoluteFill} />
          <AppText style={styles.emoji}>{v.emoji}</AppText>
          <AppText variant="bodySemi" color="#fff">{v.label}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.base, gap: space.sm },
  card: { width: 132, height: 92, borderRadius: radius.lg, overflow: 'hidden', padding: space.md, justifyContent: 'flex-end', gap: 2, backgroundColor: colors.bgElevated2 },
  emoji: { fontSize: 24 },
});
