import React from 'react';
import { View, ScrollView, Pressable, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../ui/Icon';
import { AppText, colors, space } from '../../lib/theme';

// Seed handles shown only when the viewer follows no one yet, so the row never sits
// empty. These are illustrative placeholders (not real accounts) — replaced the moment
// the follow graph has people.
const SEED = [
  { id: 'seed-1', name: 'FoodieAlger' },
  { id: 'seed-2', name: 'Ahmed' },
  { id: 'seed-3', name: 'TravelWithZ' },
];

const RING = ['#F2B441', '#E8894A']; // thin orange gradient = unviewed story

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// A single ringed avatar. `ring` draws the orange unviewed-story gradient; otherwise a
// quiet border. Falls back to an initial bubble when there's no avatar.
function StoryAvatar({ url, name, ring = true, size = 62 }) {
  const inner = size - 6;
  const body = url
    ? <Image source={{ uri: url }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
    : <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}><AppText color={colors.onAccent}>{initialOf(name)}</AppText></View>;
  return ring ? (
    <LinearGradient colors={RING} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.ringGap, { width: inner + 2, height: inner + 2, borderRadius: (inner + 2) / 2 }]}>{body}</View>
    </LinearGradient>
  ) : (
    <View style={[styles.plainRing, { width: size, height: size, borderRadius: size / 2 }]}>{body}</View>
  );
}

// Horizontal stories row: "Your story" (opens the composer) + people you follow with
// unviewed orange rings + an "Add story" button. The parent decides what a tap means:
// sample handles play in the story viewer, real people open their profile.
export function StoriesBar({ me, people, onOpenStory, onAddStory }) {
  const list = people?.length ? people : SEED;
  const isSeed = !people?.length;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Your story */}
      <Pressable style={styles.item} onPress={onAddStory} accessibilityLabel="Add to your story">
        <View>
          <StoryAvatar url={me?.avatarUrl} name={me?.name} ring={false} />
          <View style={styles.plusBadge}><Icon name="plus" size={13} color={colors.onAccent} /></View>
        </View>
        <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.label}>Your story</AppText>
      </Pressable>

      {list.map((p) => (
        <Pressable
          key={p.id}
          style={styles.item}
          onPress={() => (isSeed ? null : onOpenStory?.(p))}
          accessibilityLabel={`${p.name || 'Traveler'}'s story`}
        >
          <StoryAvatar url={p.avatarUrl} name={p.name} />
          <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.label}>{p.name || 'Traveler'}</AppText>
        </Pressable>
      ))}

      {/* Add story button */}
      <Pressable style={styles.item} onPress={onAddStory} accessibilityLabel="Add story">
        <View style={styles.addCircle}><Icon name="plus" size={22} color={colors.accent} /></View>
        <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.label}>Add story</AppText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: space.md },
  content: { paddingHorizontal: space.base, gap: space.md, alignItems: 'flex-start' },
  item: { alignItems: 'center', width: 68, gap: 5 },
  label: { maxWidth: 66, textAlign: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  ringGap: { backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center' },
  plainRing: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line },
  fallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  plusBadge: { position: 'absolute', bottom: -1, right: -1, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bgBase, alignItems: 'center', justifyContent: 'center' },
  addCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
});
