import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CATEGORY_COLORS, categoryLabel } from '../../lib/categories';
import { Avatar, timeAgo } from '../social/PostCard';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius } from '../../lib/theme';

// Derive a couple of hashtag-style tags: the place category + any #tags in the body.
function tagsFor(post) {
  const out = [];
  if (post.place?.category) out.push(categoryLabel(post.place.category));
  const hash = (post.body || '').match(/#(\w+)/g);
  if (hash) hash.slice(0, 3).forEach((h) => out.push(h.replace('#', '')));
  return out.slice(0, 4);
}

// The immersive "Recommended for you" hero: a full-bleed photo post with author, an
// overlaid location + caption over a dark scrim, engagement metrics, and a Save action.
// Reads straight from the real post shape (see fetchMomentPosts). Presentation only.
export function FeedHeroCard({ post, liked, saved, onToggleLike, onToggleSave, onShare, onOpenPlace, onOpenComments }) {
  if (!post) return null;
  const { author, place, body, photoUrls = [] } = post;
  const uri = photoUrls[0];
  const accent = place?.category ? (CATEGORY_COLORS[place.category] ?? CATEGORY_COLORS.other) : colors.accent;
  const verified = author?.trustTier && author.trustTier !== 'standard';
  const likeCount = (post.helpfulCount ?? 0) + (liked ? 1 : 0);
  const tags = tagsFor(post);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.card} onPress={() => onOpenPlace?.(place)} accessibilityRole="button">
        {uri ? <Image source={{ uri }} style={styles.bg} resizeMode="cover" /> : <View style={[styles.bg, { backgroundColor: accent }]} />}

        {/* Author, top */}
        <View style={styles.top}>
          <Avatar url={author?.avatarUrl} name={author?.name} size={34} />
          <View style={styles.topText}>
            <View style={styles.nameRow}>
              <AppText variant="label" color="#fff" numberOfLines={1}>@{(author?.name || 'someone').replace(/\s+/g, '')}</AppText>
              {verified ? <Icon name="check" size={13} color={colors.accent2} /> : null}
            </View>
            <AppText variant="caption" color="rgba(255,255,255,0.8)">{timeAgo(post.createdAt)}</AppText>
          </View>
        </View>

        {/* Caption scrim, bottom */}
        <LinearGradient colors={['rgba(11,18,32,0)', 'rgba(11,18,32,0.35)', 'rgba(11,18,32,0.94)']} style={styles.scrim}>
          {place ? (
            <View style={styles.locRow}>
              <Icon name="pin" size={13} color={colors.accent} fill />
              <AppText variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={1}>{[place.name, place.city].filter(Boolean).join(', ')}</AppText>
            </View>
          ) : null}
          {body ? <AppText variant="heading" color="#fff" numberOfLines={2} style={styles.title}>{body}</AppText> : null}
          {place?.category ? <AppText variant="label" color="rgba(255,255,255,0.75)" numberOfLines={1}>{categoryLabel(place.category)}</AppText> : null}
        </LinearGradient>
      </Pressable>

      {/* Engagement */}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => onToggleLike?.(post, !liked)} hitSlop={6} accessibilityLabel="Like">
          <Icon name="heart" size={20} fill={liked} color={liked ? colors.danger : colors.textLo} />
          <AppText variant="label" color={colors.textLo}>{likeCount}</AppText>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onOpenComments?.(post)} hitSlop={6} accessibilityLabel="Comments">
          <Icon name="comment" size={19} color={colors.textLo} />
          <AppText variant="label" color={colors.textLo}>{post.commentCount ?? 0}</AppText>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onShare?.(post)} hitSlop={6} accessibilityLabel="Share">
          <Icon name="share" size={18} color={colors.textLo} />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable style={styles.saveBtn} onPress={() => onToggleSave?.(place, !saved)} hitSlop={6} accessibilityLabel="Save">
          <Icon name="bookmark" size={15} fill={saved} color={saved ? colors.accent : colors.textHi} />
          <AppText variant="label" color={saved ? colors.accent : colors.textHi}>{saved ? 'Saved' : 'Save'}</AppText>
        </Pressable>
      </View>

      {/* Tags */}
      {tags.length ? (
        <View style={styles.tags}>
          {tags.map((t, i) => (
            <View key={`${t}-${i}`} style={styles.tag}><AppText variant="caption" color={colors.textLo}>{t}</AppText></View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  card: { marginHorizontal: space.base, height: 260, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated2 },
  bg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  top: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  topText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.base, paddingTop: space.xl, paddingBottom: space.base, gap: 4 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { fontSize: 21, lineHeight: 26 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.base, marginTop: space.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  spacer: { flex: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, marginTop: space.md },
  tag: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.bgElevated },
});
