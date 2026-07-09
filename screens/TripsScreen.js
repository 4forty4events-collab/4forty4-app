import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useMyTrips } from '../lib/coordination/hooks';
import { CreateTripModal } from '../components/coordination/CreateTripModal';
import { AppText, colors, space, radius } from '../lib/theme';

const ROLE_STYLE = {
  owner: { bg: colors.accent, fg: colors.onAccent },
  editor: { bg: 'rgba(79,163,199,0.16)', fg: colors.accent2 },
  viewer: { bg: colors.bgElevated2, fg: colors.textLo },
};

function fmtRange(a, b) {
  if (!a) return '';
  return b && b !== a ? `${a} → ${b}` : a;
}

export default function TripsScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;
  const { data: trips = [], isLoading } = useMyTrips(userId);
  const [createOpen, setCreateOpen] = useState(false);

  const openTrip = (tr) => navigation.navigate('TripWorkspace', { tripId: tr.id, title: tr.title, myRole: tr.myRole });

  // Auto-archive: a plan whose last date has passed leaves the active list and
  // moves to "Past plans" (retained, not deleted). Dateless trips stay active.
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const isPast = (tr) => {
    const last = tr.endDate || tr.startDate;
    return !!last && last < todayStr;
  };
  const activeTrips = trips.filter((tr) => !isPast(tr));
  const pastTrips = trips.filter(isPast);

  const renderTripCard = (tr, past = false) => {
    const rs = ROLE_STYLE[tr.myRole] ?? ROLE_STYLE.viewer;
    return (
      <TouchableOpacity key={tr.id} style={[styles.card, past && styles.cardPast]} onPress={() => openTrip(tr)}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>{tr.title}</AppText>
          {tr.startDate ? <AppText variant="label" color={colors.textLo} style={styles.cardDates}>{fmtRange(tr.startDate, tr.endDate)}</AppText> : null}
        </View>
        <View style={[styles.roleChip, { backgroundColor: rs.bg }]}><AppText variant="caption" color={rs.fg}>{t(`coordination.role_${tr.myRole}`)}</AppText></View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <AppText variant="title">{t('coordination.trips')}</AppText>
        {userId ? (
          <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={8}><AppText variant="label" color={colors.accent2}>＋ {t('coordination.newTrip')}</AppText></TouchableOpacity>
        ) : null}
      </View>

      {!userId ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo}>{t('community.signInToReview')}</AppText></View>
      ) : isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : trips.length === 0 ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo}>{t('coordination.noTrips')}</AppText></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.base }}>
          {activeTrips.length === 0 ? (
            <AppText variant="body" color={colors.textLo} style={styles.sectionEmpty}>{t('coordination.noTrips')}</AppText>
          ) : activeTrips.map((tr) => renderTripCard(tr, false))}

          {pastTrips.length > 0 ? (
            <>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionHeader}>{t('coordination.pastPlans')}</AppText>
              {pastTrips.map((tr) => renderTripCard(tr, true))}
            </>
          ) : null}
        </ScrollView>
      )}

      <CreateTripModal visible={createOpen} onClose={() => setCreateOpen(false)} userId={userId} market={market} onCreated={openTrip} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  cardPast: { opacity: 0.55 },
  sectionHeader: { marginTop: space.md, marginBottom: space.sm },
  sectionEmpty: { marginBottom: space.sm },
  cardDates: { marginTop: 3 },
  roleChip: { borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 10 },
});
