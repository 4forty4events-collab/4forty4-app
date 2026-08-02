import React from 'react';
import { View, Image, Pressable, Alert, StyleSheet } from 'react-native';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { experienceBadge, placeLabel } from '../../lib/social/experiences';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

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

// The experience badge — what this post IS right now, not what it was filed as. A green
// LIVE VERIFIED pill means the server confirmed the poster's proximity at post time; it is
// deliberately the only badge that gets a solid fill, because its scarcity is what makes
// it worth reading. Older claims decay (see resolveExperience), so nothing here can go on
// insisting it's happening now.
export function ExperiencePill({ badge, style }) {
  if (!badge) return null;
  const solid = badge.key === 'live' && badge.verified;
  return (
    <View
      accessible
      // The glyph is decorative; the words carry the meaning. "Live verified" reads as
      // the claim it is, rather than "green circle, LIVE VERIFIED".
      accessibilityLabel={solid ? 'Live now, location verified' : badge.label.toLowerCase()}
      style={[
        styles.expPill,
        solid ? { backgroundColor: badge.color, borderColor: badge.color } : { borderColor: `${badge.color}99` },
        style,
      ]}
    >
      <AppText style={styles.expGlyph}>{badge.glyph}</AppText>
      <AppText variant="caption" color={solid ? '#08130A' : badge.color}>{badge.label}</AppText>
    </View>
  );
}

// A social "moment": a user's experience rendered as an Instagram-style post. The
// experience (photo + words) leads; the place is secondary but one tap away via Open Place —
// the bridge back to the directory. Like = the review's "helpful" reaction. Presentation only.
export function PostCard({ post, liked, saved, canDelete, onDelete, onReport, onOpenComments, onToggleLike, onToggleSave, onOpenPlace, onShare, onAsk }) {
  const { author, place, body, photoUrls = [], rating, helpfulCount = 0 } = post;
  const uri = photoUrls[0];
  const likeCount = helpfulCount + (liked ? 1 : 0);
  const accent = place?.category ? (CATEGORY_COLORS[place.category] ?? CATEGORY_COLORS.other) : colors.accent;
  const verified = author?.trustTier && author.trustTier !== 'standard';
  const badge = experienceBadge(post);
  // Never coordinates — the server stores a friendly label and we fall back to the tag.
  const where = placeLabel(post) ?? place?.name ?? null;

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
            hitSlop={8}
            accessibilityLabel="Post options"
            onPress={() => (canDelete
              ? Alert.alert('Your moment', null, [
                  { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(post) },
                  { text: 'Cancel', style: 'cancel' },
                ])
              : Alert.alert('Moment', null, [
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
          ? <Image source={{ uri }} style={styles.image} resizeMode="cover" />
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

      {body ? <AppText variant="body" color={colors.textHi} numberOfLines={3} style={styles.body}>{body}</AppText> : null}

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => onToggleLike(post, !liked)} hitSlop={6} accessibilityLabel="Like">
          <Icon name="heart" size={20} fill={liked} color={liked ? colors.danger : colors.textLo} />
          {likeCount > 0 ? <AppText variant="label" color={colors.textLo}>{likeCount}</AppText> : null}
        </Pressable>
        {post.source === 'post' ? (
          <Pressable style={styles.action} onPress={() => onOpenComments?.(post)} hitSlop={6} accessibilityLabel="Comments">
            <Icon name="comment" size={19} color={colors.textLo} />
            {post.commentCount > 0 ? <AppText variant="label" color={colors.textLo}>{post.commentCount}</AppText> : null}
          </Pressable>
        ) : null}
        <Pressable style={styles.action} onPress={() => onShare(post)} hitSlop={6} accessibilityLabel="Share">
          <Icon name="share" size={18} color={colors.textLo} />
        </Pressable>
        <Pressable style={styles.action} onPress={() => onToggleSave(place, !saved)} hitSlop={6} accessibilityLabel="Save">
          <Icon name="bookmark" size={19} fill={saved} color={saved ? colors.accent : colors.textLo} />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable style={styles.openBtn} onPress={() => onOpenPlace(place)} accessibilityLabel="Open place">
          <Icon name="pin" size={14} color={colors.onAccent} />
          <AppText variant="label" color={colors.onAccent}>Open Place</AppText>
        </Pressable>
      </View>

      {/* "Ask about this" — how conversations START in Purday. Not a Message button on a
          profile: you're asking a specific person about a specific experience, and the
          thread carries that origin. Only on real posts (review-posts live in another
          table) and never on your own. */}
      {onAsk && post.source === 'post' ? (
        <Pressable style={styles.askBtn} onPress={() => onAsk(post)} accessibilityLabel="Ask about this experience">
          <Icon name="comment" size={14} color={colors.accent2} />
          <AppText variant="label" color={colors.accent2}>
            {badge?.key === 'live' ? 'Ask how it is right now' : 'Ask about this experience'}
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

  body: { paddingHorizontal: space.base, marginTop: space.sm, lineHeight: 21 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.base, marginTop: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  spacer: { flex: 1 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  askBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: space.base, marginTop: space.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(79,163,199,0.4)' },

  tags: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, marginTop: space.md },
  tag: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
});
