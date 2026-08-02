import React, { useEffect, useRef } from 'react';
import { View, Image, Pressable, Animated, Easing, Alert, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { experienceBadge, placeLabel, resolveExperience } from '../../lib/social/experiences';
import { haversineM, formatDistance, walkMinutes } from '../../lib/geo';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, useReducedMotion } from '../../lib/theme';

// Compact "time ago" — chronological context, not precise timestamps.
export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function Avatar({ url, name, size = 38 }) {
  const initial = ((name ?? '?')[0] ?? '?').toUpperCase();
  const st = { width: size, height: size, borderRadius: size / 2 };
  return url
    ? <Image source={{ uri: url }} style={st} />
    : <View style={[st, styles.avatarFallback]}><AppText color={colors.onAccent} style={{ fontSize: size * 0.42 }}>{initial}</AppText></View>;
}

// Blue circular verified tick — shown next to verified authors (trust_tier != standard).
export function VerifiedBadge({ size = 15 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="check" size={size - 5} color="#fff" strokeWidth={2.4} />
    </View>
  );
}

// The experience badge — what this post IS right now, not what it was filed as.
//
// Motion here is a status light, not decoration: ONLY the present-tense states move.
// A live badge breathes, an on-the-way badge drifts as if still travelling, and
// everything past — just finished, memories — is completely still. So a glance down the
// feed reads the city's activity without anybody reading a word. Because badges decay
// (resolveExperience), a post stops animating on its own once its claim expires; nothing
// keeps pulsing at you a day later.
export function ExperiencePill({ badge, style }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  const animated = !!badge && (badge.key === 'live' || badge.key === 'on_the_way');

  useEffect(() => {
    if (!animated || reduced) { v.setValue(0); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: badge.key === 'live' ? 1400 : 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: badge.key === 'live' ? 1400 : 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, reduced, badge?.key, v]);

  if (!badge) return null;
  const solid = badge.key === 'live' && badge.verified;

  // Live breathes in place; on-the-way slides a couple of points, like something moving.
  const motion = !animated || reduced ? {} : badge.key === 'live'
    ? { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }
    : { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }) }] };

  return (
    <Animated.View
      accessible
      // The glyph is decorative; the words carry the meaning. "Live verified" reads as
      // the claim it is, rather than "green circle, LIVE VERIFIED".
      accessibilityLabel={solid ? 'Live now, location verified' : badge.label.toLowerCase()}
      style={[
        styles.expPill,
        solid ? { backgroundColor: badge.color, borderColor: badge.color } : { borderColor: `${badge.color}99` },
        style,
        motion,
      ]}
    >
      <AppText style={styles.expGlyph}>{badge.glyph}</AppText>
      <AppText variant="caption" color={solid ? '#08130A' : badge.color}>{badge.label}</AppText>
    </Animated.View>
  );
}

// A heart that fills rather than blinks. One spring on the way in, nothing on the way
// out — un-liking shouldn't be celebrated.
function LikeButton({ liked, count, onPress }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }   // don't animate on mount
    if (!liked || reduced) return;
    v.setValue(0.8);
    Animated.spring(v, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }).start();
  }, [liked, reduced, v]);

  return (
    <Pressable style={styles.action} onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'}>
      <Animated.View style={{ transform: [{ scale: v }] }}>
        <Icon name="heart" size={20} fill={liked} color={liked ? colors.danger : colors.textLo} />
      </Animated.View>
      {count > 0 ? <AppText variant="label" color={colors.textLo}>{count}</AppText> : null}
    </Pressable>
  );
}

// A card in the Explorer feed. It answers, in this order: what kind of experience, where,
// how far, when — before it ever gets to the caption. That ordering is the difference
// between "someone posted a photo" and "something is happening near me".
function PostCardImpl({ post, liked, saved, canDelete, viewerCoords, onDelete, onReport, onOpenComments, onToggleLike, onToggleSave, onOpenPlace, onShare, onAsk }) {
  const { author, place, body, photoUrls = [], rating, helpfulCount = 0 } = post;
  const uri = photoUrls[0];
  const likeCount = helpfulCount + (liked ? 1 : 0);
  const accent = place?.category ? (CATEGORY_COLORS[place.category] ?? CATEGORY_COLORS.other) : colors.accent;
  const verified = author?.trustTier && author.trustTier !== 'standard';
  const badge = experienceBadge(post);
  const { key: expKey } = resolveExperience(post);
  // Never coordinates — a venue or area name only.
  const where = placeLabel(post);
  // Computed on-device from the viewer's own position; nothing is sent anywhere.
  const distM = viewerCoords && place ? haversineM(viewerCoords, place) : null;
  const distance = formatDistance(distM);
  const walk = walkMinutes(distM);

  // The one line under the photo that says where/how far/when.
  const context = [
    where,
    distance,
    timeAgo(post.createdAt),
  ].filter(Boolean).join('  ·  ');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar url={author?.avatarUrl} name={author?.name} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <AppText variant="bodySemi" numberOfLines={1}>{author?.name || 'Someone'}</AppText>
            {verified ? <VerifiedBadge /> : null}
          </View>
          <AppText variant="caption" color={colors.textMute}>{timeAgo(post.createdAt)}</AppText>
        </View>
        {post.source === 'post' ? (
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            onPress={() => (canDelete
              ? Alert.alert('Your experience', null, [
                  { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(post) },
                  { text: 'Cancel', style: 'cancel' },
                ])
              : Alert.alert('Experience', null, [
                  { text: 'Report', style: 'destructive', onPress: () => onReport?.(post) },
                  { text: 'Cancel', style: 'cancel' },
                ]))}
          >
            <Icon name="more" size={18} color={colors.textLo} />
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.imageWrap} onPress={() => onOpenPlace(place)} accessibilityRole="button">
        {uri
          ? <ExpoImage source={{ uri }} style={styles.image} contentFit="cover" transition={220} cachePolicy="memory-disk" recyclingKey={post.id} />
          : <View style={[styles.image, { backgroundColor: accent }]} />}
        <ExperiencePill badge={badge} style={styles.expOnImage} />
        {photoUrls.length > 1 && (
          <View style={styles.countPill}><AppText variant="caption" color={colors.textHi}>{`1/${photoUrls.length}`}</AppText></View>
        )}
        {where ? (
          <View style={styles.placePill}>
            <Icon name="pin" size={12} color={colors.textHi} />
            <AppText variant="caption" color={colors.textHi} numberOfLines={1} style={styles.placeText}>
              {badge?.verified ? `Verified at ${where}` : [where, place?.city].filter(Boolean).join(', ')}
            </AppText>
          </View>
        ) : null}
      </Pressable>

      {/* Where · how far · when — the orienting line, above the caption on purpose. */}
      {context ? (
        <View style={styles.contextRow}>
          <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.contextText}>{context}</AppText>
          {walk && expKey !== 'memory' ? (
            <AppText variant="caption" color={colors.accent2}>{walk} min walk</AppText>
          ) : null}
        </View>
      ) : null}

      {body ? <AppText variant="body" color={colors.textHi} numberOfLines={3} style={styles.body}>{body}</AppText> : null}

      <View style={styles.actions}>
        <LikeButton liked={liked} count={likeCount} onPress={() => onToggleLike(post, !liked)} />
        {post.source === 'post' ? (
          <Pressable style={styles.action} onPress={() => onOpenComments?.(post)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Comments">
            <Icon name="comment" size={19} color={colors.textLo} />
            {post.commentCount > 0 ? <AppText variant="label" color={colors.textLo}>{post.commentCount}</AppText> : null}
          </Pressable>
        ) : null}
        <Pressable style={styles.action} onPress={() => onShare(post)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share">
          <Icon name="share" size={18} color={colors.textLo} />
        </Pressable>
        <Pressable style={styles.action} onPress={() => onToggleSave(place, !saved)} hitSlop={10} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save this place'}>
          <Icon name="bookmark" size={19} fill={saved} color={saved ? colors.accent : colors.textLo} />
        </Pressable>
        <View style={styles.spacer} />
        {/* "Can I go there?" — the recreate affordance. A post is not an itinerary, so this
            opens the place rather than pretending a single stop can be cloned. */}
        <Pressable style={styles.openBtn} onPress={() => onOpenPlace(place)} accessibilityRole="button" accessibilityLabel="Open this place">
          <Icon name="pin" size={14} color={colors.onAccent} />
          <AppText variant="label" color={colors.onAccent}>Take me there</AppText>
        </Pressable>
      </View>

      {/* "Ask about this" — how conversations START in Purday. Not a Message button on a
          profile: you're asking a specific person about a specific experience, and the
          thread carries that origin. Only on real posts (review-posts live in another
          table) and never on your own. */}
      {onAsk && post.source === 'post' ? (
        <Pressable style={styles.askBtn} onPress={() => onAsk(post)} accessibilityRole="button" accessibilityLabel="Ask about this experience">
          <Icon name="comment" size={14} color={colors.accent2} />
          <AppText variant="label" color={colors.accent2}>
            {expKey === 'live' ? 'Ask how it is right now' : 'Ask about this experience'}
          </AppText>
        </Pressable>
      ) : null}

      {(place?.category || rating != null) ? (
        <View style={styles.tags}>
          {place?.category ? (
            <View style={[styles.tag, { borderColor: accent }]}><AppText variant="caption" color={accent}>{categoryLabel(place.category)}</AppText></View>
          ) : null}
          {rating != null ? (
            <View style={styles.tag}><AppText variant="caption" color={colors.star}>{`★ ${Number(rating).toFixed(1)}`}</AppText></View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Memoized: the feed re-renders on every like/save/dwell tick, and a card only actually
// changes when its own row, its own like/save state, or the viewer's position moves.
export const PostCard = React.memo(PostCardImpl, (a, b) => (
  a.post === b.post
  && a.liked === b.liked
  && a.saved === b.saved
  && a.canDelete === b.canDelete
  && a.viewerCoords === b.viewerCoords
  && a.onAsk === b.onAsk
));

const styles = StyleSheet.create({
  card: { marginBottom: space.xl },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, marginBottom: space.sm },
  headerText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  imageWrap: { marginHorizontal: space.base, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated2 },
  image: { width: '100%', height: 260 },
  countPill: { position: 'absolute', top: 10, right: 10, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 8 },
  expPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.glass, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 },
  expGlyph: { fontSize: 11 },
  expOnImage: { position: 'absolute', top: 10, left: 10 },
  placePill: { position: 'absolute', bottom: 10, left: 10, maxWidth: '85%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  placeText: { flexShrink: 1 },

  contextRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, marginTop: space.sm },
  contextText: { flex: 1 },
  body: { paddingHorizontal: space.base, marginTop: 4, lineHeight: 21 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.base, marginTop: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  spacer: { flex: 1 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  askBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: space.base, marginTop: space.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(79,163,199,0.4)' },

  tags: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, marginTop: space.md },
  tag: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
});
