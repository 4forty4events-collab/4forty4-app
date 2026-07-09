import React, { useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StarRating } from './StarRating';
import { ReviewCard } from './ReviewCard';
import { ReviewComposer } from './ReviewComposer';
import { useLocale } from '../../providers/LocaleProvider';
import { useSession } from '../../providers/SessionProvider';
import { useReviews, useMyReview, useMyHelpful } from '../../lib/community/hooks';
import { AppText, colors, space } from '../../lib/theme';
import { Button } from '../ui/Button';

// Reviews block for a venue/event Detail: rating summary, a write/edit CTA, and
// the list of reviews with helpful counters. Renders inline (mapped, not a nested
// FlatList) since it lives inside the Detail ScrollView.
export function ReviewsSection({ item, navigation }) {
  const { t } = useLocale();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const target = useMemo(() => ({ kind: item.kind, id: item.id }), [item.kind, item.id]);

  const { data: reviews = [], isLoading } = useReviews(target);
  const { data: myReview } = useMyReview(userId, target);
  const { data: myHelpful } = useMyHelpful(userId, reviews.map((r) => r.id));
  const [composerOpen, setComposerOpen] = useState(false);

  const summary = useMemo(() => {
    if (!reviews.length) return null;
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    return { avg: Math.round(avg * 10) / 10, count: reviews.length };
  }, [reviews]);

  const onCta = () => {
    if (!userId) { navigation?.navigate('SignIn'); return; }
    setComposerOpen(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <AppText variant="title">{t('community.reviews')}</AppText>
        {summary ? (
          <View style={styles.summary}>
            <StarRating value={summary.avg} size={15} readonly />
            <AppText variant="label" color={colors.textLo}>{summary.avg} · {t('community.reviewsCount', { count: summary.count })}</AppText>
          </View>
        ) : null}
      </View>

      <Button
        label={!userId ? t('community.signInToReview') : myReview ? t('community.editReview') : t('community.writeReview')}
        variant="secondary"
        onPress={onCta}
        style={styles.cta}
      />

      {isLoading ? (
        <ActivityIndicator style={{ marginVertical: space.base }} color={colors.accent} />
      ) : reviews.length === 0 ? (
        <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('community.noReviews')}</AppText>
      ) : (
        reviews.map((r) => (
          <ReviewCard key={r.id} review={r} userId={userId} initiallyReacted={!!myHelpful?.has(r.id)} />
        ))
      )}

      <ReviewComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        target={target}
        userId={userId}
        market={item.market}
        existing={myReview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cta: { marginBottom: space.base },
  empty: { paddingVertical: space.sm },
});
