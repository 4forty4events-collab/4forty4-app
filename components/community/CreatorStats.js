import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { useCreatorStats, useUserBadges } from '../../lib/community/hooks';
import { AppText, colors, space, radius } from '../../lib/theme';

const BADGE_ICON = {
  verified_visitor: '✓', verified_creator: '★', top_reviewer: '🏆', local_expert: '📍', organizer: '🎫',
};

const TILES = [
  ['reviewsWritten', 'community.statReviews'],
  ['photosShared', 'community.statPhotos'],
  ['helpfulReceived', 'community.statHelpful'],
  ['answersGiven', 'community.statAnswers'],
];

// Creator credibility for the Profile dashboard: derived contribution stats +
// earned badges. Renders through the same visual language as the rest of Profile.
export function CreatorStats({ userId }) {
  const { t } = useLocale();
  const { data: stats } = useCreatorStats(userId);
  const { data: badges = [] } = useUserBadges(userId);
  if (!userId) return null;

  return (
    <View>
      <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('community.creatorStats')}</AppText>
      <View style={styles.statsRow}>
        {TILES.map(([key, label]) => (
          <View key={key} style={styles.tile}>
            <AppText variant="title">{stats?.[key] ?? 0}</AppText>
            <AppText variant="caption" color={colors.textLo} style={styles.tileLabel}>{t(label)}</AppText>
          </View>
        ))}
      </View>

      {badges.length > 0 && (
        <>
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('community.badges')}</AppText>
          <View style={styles.badgeWrap}>
            {badges.map((b) => (
              <View key={b.badge} style={styles.badge}>
                <AppText style={styles.badgeIcon}>{BADGE_ICON[b.badge] ?? '🎖'}</AppText>
                <AppText variant="label" color={colors.star}>{t(`community.badge_${b.badge}`)}</AppText>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: space.xl, marginBottom: space.sm },
  statsRow: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: space.base, alignItems: 'center' },
  tileLabel: { marginTop: 3 },
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(240,181,74,0.14)', borderWidth: 1, borderColor: 'rgba(240,181,74,0.4)', borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: space.md },
  badgeIcon: { fontSize: 14 },
});
