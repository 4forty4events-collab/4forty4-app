import React from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocale } from '../providers/LocaleProvider';
import { useListingAnalytics } from '../lib/organizer/hooks';
import { AnalyticsChart } from '../components/organizer/AnalyticsChart';
import { AppText, colors, space, radius } from '../lib/theme';

// Merchant analytics for one listing: summary tiles + a daily views chart.
export default function ListingAnalyticsScreen({ route, navigation }) {
  const { kind, id, title } = route.params;
  const { t } = useLocale();
  const { data, isLoading } = useListingAnalytics(kind, id, 30);
  const totals = data?.totals ?? { views: 0, saves: 0, checkIns: 0 };
  const daily = data?.daily ?? [];

  const tiles = [
    [totals.views, t('organizer.views')],
    [totals.saves, t('organizer.saves')],
    [totals.checkIns, t('organizer.checkIns')],
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
        <AppText variant="heading" numberOfLines={1} style={styles.topTitle}>{t('organizer.analytics')}</AppText>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          {title ? <AppText variant="heading">{title}</AppText> : null}
          <AppText variant="label" color={colors.textLo} style={styles.period}>{t('organizer.last30')}</AppText>

          <View style={styles.tilesRow}>
            {tiles.map(([value, label]) => (
              <View key={label} style={styles.tile}>
                <AppText variant="display" style={styles.tileValue}>{value}</AppText>
                <AppText variant="caption" color={colors.textLo} style={styles.tileLabel}>{label}</AppText>
              </View>
            ))}
          </View>

          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('organizer.dailyActivity')}</AppText>
          {daily.length > 0 ? (
            <AnalyticsChart daily={daily} metric="views" />
          ) : (
            <AppText variant="body" color={colors.textLo}>{t('organizer.noData')}</AppText>
          )}
          <View style={{ height: space.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  topTitle: { flex: 1, textAlign: 'center' },
  content: { padding: space.lg },
  period: { marginTop: 2, marginBottom: space.base },
  tilesRow: { flexDirection: 'row', gap: space.md },
  tile: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingVertical: space.lg, alignItems: 'center' },
  tileValue: { fontSize: 28 },
  tileLabel: { marginTop: 4 },
  sectionLabel: { marginTop: space.xl, marginBottom: space.md },
});
