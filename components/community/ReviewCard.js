import React, { useState } from 'react';
import { View, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { StarRating } from './StarRating';
import { TrustBadge } from '../safety/TrustBadge';
import { useLocale } from '../../providers/LocaleProvider';
import { setHelpful } from '../../lib/community/communityRepository';
import { AppText, colors, space, radius } from '../../lib/theme';

function initials(name) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

// A single review: author, stars, verified badge, body, photos, helpful toggle.
export function ReviewCard({ review, userId, initiallyReacted = false, navigation }) {
  const { t } = useLocale();
  const [reacted, setReacted] = useState(initiallyReacted);
  const [count, setCount] = useState(review.helpfulCount ?? 0);

  const authorId = review.author?.id ?? review.userId;
  const openProfile = () => { if (navigation && authorId) navigation.navigate('PublicProfile', { userId: authorId }); };

  const toggleHelpful = async () => {
    if (!userId) return;
    const next = !reacted;
    setReacted(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      await setHelpful(userId, review.id, next);
    } catch {
      setReacted(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.identity} onPress={openProfile} activeOpacity={0.7} disabled={!navigation || !authorId}>
          {review.author?.avatarUrl
            ? <Image source={{ uri: review.author.avatarUrl }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarFallback]}><AppText color="#fff" style={styles.avatarInitial}>{initials(review.author?.name)}</AppText></View>}
          <View style={styles.headText}>
            <View style={styles.nameRow}>
              <AppText variant="bodySemi" numberOfLines={1} style={styles.author}>{review.author?.name ?? t('profile.explorer')}</AppText>
              <TrustBadge tier={review.author?.trustTier} compact />
            </View>
            <View style={styles.subRow}>
              <StarRating value={review.rating} size={14} readonly />
              {review.isVerifiedVisitor ? <AppText variant="caption" color={colors.success}>✓ {t('community.verified')}</AppText> : null}
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {review.title ? <AppText variant="bodySemi" style={styles.title}>{review.title}</AppText> : null}
      {review.body ? <AppText variant="body" color={colors.textLo}>{review.body}</AppText> : null}

      {review.photoUrls?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
          {review.photoUrls.map((uri, i) => <Image key={i} source={{ uri }} style={styles.photo} />)}
        </ScrollView>
      ) : null}

      <TouchableOpacity style={[styles.helpfulBtn, reacted && styles.helpfulOn]} onPress={toggleHelpful} disabled={!userId}>
        <AppText variant="label" color={reacted ? colors.success : colors.textLo}>👍 {t('community.helpful')}{count ? ` · ${count}` : ''}</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.base, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgElevated2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  avatarInitial: { fontSize: 16 },
  headText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { flexShrink: 1 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 3 },
  title: { marginBottom: 4 },
  photos: { marginTop: space.sm },
  photo: { width: 92, height: 92, borderRadius: radius.md, marginRight: space.sm, backgroundColor: colors.bgElevated2 },
  helpfulBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: 7, paddingHorizontal: space.md },
  helpfulOn: { backgroundColor: 'rgba(79,190,143,0.14)', borderColor: 'rgba(79,190,143,0.4)' },
});
