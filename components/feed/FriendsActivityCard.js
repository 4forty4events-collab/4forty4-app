import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { Avatar, timeAgo, VerifiedBadge } from '../social/PostCard';
import { AppText, colors, space, radius } from '../../lib/theme';

function handleOf(name) {
  return `@${(name || 'someone').replace(/\s+/g, '')}`;
}

// A structured friends-activity card built from a real photo post: header (who + where +
// when), the caption, and a mini media grid (two tiles + a third with a "+N" overlay when
// there are extra photos). Rendered only when a multi-photo post exists; otherwise the
// screen falls back to the plain ActivityRow list.
export function FriendsActivityCard({ post, onOpenProfile, onOpenPost }) {
  if (!post) return null;
  const { author, place, body, photoUrls = [] } = post;
  const grid = photoUrls.slice(0, 3);
  const extra = photoUrls.length - 3;
  const where = place ? [place.name, place.city].filter(Boolean).join(', ') : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={() => onOpenProfile?.(author?.id)} hitSlop={6}>
          <Avatar url={author?.avatarUrl} name={author?.name} size={40} />
        </Pressable>
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <AppText variant="bodySemi">{handleOf(author?.name)}</AppText>
            {author?.trustTier && author.trustTier !== 'standard' ? <VerifiedBadge size={13} /> : null}
            <AppText color={colors.textLo}>{where ? 'visited' : 'shared a moment'}</AppText>
            {where ? <AppText variant="bodySemi" color={colors.accent}>{where}</AppText> : null}
          </View>
          <AppText variant="caption" color={colors.textMute}>{timeAgo(post.createdAt)}</AppText>
        </View>
      </View>

      {body ? <AppText variant="body" color={colors.textHi} numberOfLines={2} style={styles.body}>{body}</AppText> : null}

      {grid.length ? (
        <Pressable style={styles.grid} onPress={() => onOpenPost?.(post)}>
          {grid.map((uri, i) => (
            <View key={i} style={styles.tileWrap}>
              <Image source={{ uri }} style={styles.tile} />
              {i === 2 && extra > 0 ? (
                <View style={styles.moreOverlay}><AppText variant="title" color="#fff">+{extra}</AppText></View>
              ) : null}
            </View>
          ))}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.base, marginBottom: space.lg, padding: space.base, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  body: { lineHeight: 21 },
  grid: { flexDirection: 'row', gap: 4, height: 150 },
  tileWrap: { flex: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgElevated2 },
  tile: { width: '100%', height: '100%' },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,18,32,0.55)', alignItems: 'center', justifyContent: 'center' },
});
