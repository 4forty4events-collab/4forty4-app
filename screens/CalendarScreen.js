import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useUpcomingSavedEvents, useMyTrips } from '../lib/coordination/hooks';
import { CalendarGrid } from '../components/coordination/CalendarGrid';
import { AppText, colors, space, radius } from '../lib/theme';

function fmtRange(startDate, endDate) {
  if (!startDate) return '';
  return endDate && endDate !== startDate ? `${startDate} → ${endDate}` : startDate;
}

export default function CalendarScreen({ navigation }) {
  const { session } = useSession();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;
  const { data: events = [] } = useUpcomingSavedEvents(userId);
  const { data: trips = [] } = useMyTrips(userId);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
        <AppText variant="heading">{t('coordination.calendar')}</AppText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.card}>
          <CalendarGrid events={events} trips={trips} />
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={styles.dot} /><AppText variant="caption" color={colors.textLo}>{t('coordination.savedEvents')}</AppText></View>
            <View style={styles.legendItem}><View style={styles.band} /><AppText variant="caption" color={colors.textLo}>{t('coordination.tripsBand')}</AppText></View>
          </View>
        </View>

        {events.length > 0 ? (
          <>
            <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('coordination.savedEvents')}</AppText>
            {events.map((e) => (
              <TouchableOpacity key={e.id} style={styles.row} onPress={() => navigation.navigate('ListingDetail', { id: e.id, kind: 'event' })}>
                <AppText variant="caption" color={colors.accent2} style={styles.rowDate}>{(e.startTime ?? '').slice(0, 10)}</AppText>
                <AppText variant="bodySemi" numberOfLines={1} style={styles.rowTitle}>{e.title}</AppText>
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {trips.length > 0 ? (
          <>
            <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('coordination.trips')}</AppText>
            {trips.map((tr) => (
              <TouchableOpacity key={tr.id} style={styles.row} onPress={() => navigation.navigate('TripWorkspace', { tripId: tr.id, title: tr.title, myRole: tr.myRole })}>
                <AppText variant="caption" color={colors.accent2} style={styles.rowDate}>{fmtRange(tr.startDate, tr.endDate)}</AppText>
                <AppText variant="bodySemi" numberOfLines={1} style={styles.rowTitle}>{tr.title}</AppText>
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  card: { margin: space.base, paddingVertical: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  legend: { flexDirection: 'row', gap: 18, justifyContent: 'center', marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent2 },
  band: { width: 14, height: 3, borderRadius: 2, backgroundColor: colors.success },
  sectionLabel: { marginTop: space.base, marginBottom: space.sm, marginHorizontal: space.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 13, paddingHorizontal: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowDate: { minWidth: 82 },
  rowTitle: { flex: 1 },
});
