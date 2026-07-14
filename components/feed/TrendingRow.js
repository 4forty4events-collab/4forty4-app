import React from 'react';
import { View, ScrollView, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, timeAgo } from '../social/PostCard';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

const CARD_W = 264;

function startsIn(iso) {
  if (!iso) return 'Upcoming';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  if (diff <= 0) return 'Happening now';
  const h = Math.floor(diff / 3600);
  if (h < 1) return `Starts in ${Math.max(1, Math.floor(diff / 60))} min`;
  if (h < 24) return `Starts in ${h}h`;
  return `Starts in ${Math.floor(h / 24)}d`;
}

function handleOf(name) {
  return `@${(name || 'someone').replace(/\s+/g, '')}`;
}

// EVENT — real upcoming event. Solid Join CTA.
function EventCard({ event, onOpen }) {
  const uri = event.imageUrl;
  return (
    <Pressable style={styles.card} onPress={() => onOpen?.(event)}>
      {uri ? <Image source={{ uri }} style={styles.bg} /> : <View style={[styles.bg, styles.bgFallback]} />}
      <View style={styles.tagTL}><AppText variant="caption" color={colors.onAccent}>EVENT</AppText></View>
      <LinearGradient colors={['transparent', 'rgba(11,18,32,0.95)']} style={styles.footScrim}>
        <AppText variant="bodySemi" color="#fff" numberOfLines={1}>{event.title || 'Event'}</AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1}>{startsIn(event.startTime)}</AppText>
        <View style={styles.joinBtn}><AppText variant="label" color={colors.onAccent}>Join Event</AppText></View>
      </LinearGradient>
    </Pressable>
  );
}

// CAROUSEL — a real post with multiple photos. Pagination dots + arrow helper hint the
// gallery; tapping opens the post's place.
function CarouselCard({ post, onOpen }) {
  const uri = post.photoUrls[0];
  const n = post.photoUrls.length;
  return (
    <Pressable style={styles.card} onPress={() => onOpen?.(post)}>
      {uri ? <Image source={{ uri }} style={styles.bg} /> : <View style={[styles.bg, styles.bgFallback]} />}
      <View style={styles.arrow}><Icon name="chevronRight" size={18} color="#fff" /></View>
      <LinearGradient colors={['rgba(11,18,32,0.55)', 'transparent', 'rgba(11,18,32,0.95)']} style={styles.fullScrim}>
        <AppText variant="caption" color="rgba(255,255,255,0.85)">{handleOf(post.author?.name)} · {timeAgo(post.createdAt)}</AppText>
        <View style={styles.grow} />
        <View style={styles.dots}>
          {Array.from({ length: Math.min(n, 5) }).map((_, i) => (
            <View key={i} style={[styles.dot, i === 0 && styles.dotOn]} />
          ))}
        </View>
        <AppText variant="bodySemi" color="#fff" numberOfLines={2}>{post.body || 'A little gallery'}</AppText>
      </LinearGradient>
    </Pressable>
  );
}

// PHOTO — a standard single-photo post, compact.
function PhotoCard({ post, onOpen }) {
  const uri = post.photoUrls[0];
  return (
    <Pressable style={styles.card} onPress={() => onOpen?.(post)}>
      {uri ? <Image source={{ uri }} style={styles.bg} /> : <View style={[styles.bg, styles.bgFallback]} />}
      <LinearGradient colors={['transparent', 'rgba(11,18,32,0.95)']} style={styles.footScrim}>
        <View style={styles.byline}>
          <Avatar url={post.author?.avatarUrl} name={post.author?.name} size={22} />
          <AppText variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>{handleOf(post.author?.name)} · {timeAgo(post.createdAt)}</AppText>
        </View>
        <AppText variant="bodySemi" color="#fff" numberOfLines={1}>{post.body || 'A moment'}</AppText>
        <View style={styles.metaRow}>
          <View style={styles.meta}><Icon name="heart" size={13} color="rgba(255,255,255,0.85)" /><AppText variant="caption" color="rgba(255,255,255,0.85)">{post.helpfulCount ?? 0}</AppText></View>
          <View style={styles.meta}><Icon name="comment" size={13} color="rgba(255,255,255,0.85)" /><AppText variant="caption" color="rgba(255,255,255,0.85)">{post.commentCount ?? 0}</AppText></View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

// Horizontal "Trending today" row that deliberately mixes card TYPES so the feed never
// feels repetitive: a real event, a multi-photo carousel, then single-photo posts.
export function TrendingRow({ event, carousel, posts = [], onOpenEvent, onOpenPost }) {
  if (!event && !carousel && posts.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {event ? <EventCard event={event} onOpen={onOpenEvent} /> : null}
      {carousel ? <CarouselCard post={carousel} onOpen={onOpenPost} /> : null}
      {posts.map((p) => <PhotoCard key={`${p.source}-${p.id}`} post={p} onOpen={onOpenPost} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.base, gap: space.md },
  card: { width: CARD_W, height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated2 },
  bg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bgFallback: { backgroundColor: colors.bgElevated2 },
  tagTL: { position: 'absolute', top: space.sm, left: space.sm, backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  arrow: { position: 'absolute', top: '44%', right: space.sm, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  footScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.base, gap: 5 },
  fullScrim: { ...StyleSheet.absoluteFillObject, padding: space.base, justifyContent: 'flex-start' },
  grow: { flex: 1 },
  joinBtn: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 16 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', gap: space.md, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dots: { flexDirection: 'row', gap: 5, marginBottom: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { backgroundColor: '#fff', width: 16 },
});
