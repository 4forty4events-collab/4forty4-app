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
      {/* Secondary metrics: a borderless inline row with thin dividers, so it reads as
          a quiet credibility line — not a second data grid competing with the header. */}
      <View style={styles.inlineRow}>
        {TILES.map(([key, label], i) => (
          <React.Fragment key={key}>
            {i > 0 && <View style={styles.inlineDivider} />}
            <View style={styles.inlineItem}>
              <AppText variant="bodySemi" color={colors.textHi}>{stats?.[key] ?? 0}</AppText>
              <AppText variant="caption" color={colors.textMute} style={styles.inlineLabel}>{t(label)}</AppText>
            </View>
          </React.Fragment>
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
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  inlineItem: { flex: 1, alignItems: 'center', gap: 2 },
  inlineLabel: { marginTop: 2 },
  inlineDivider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: colors.line },
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(240,181,74,0.14)', borderWidth: 1, borderColor: 'rgba(240,181,74,0.4)', borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: space.md },
  badgeIcon: { fontSize: 14 },
});
