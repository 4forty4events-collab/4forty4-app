import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useMyTrips } from '../lib/coordination/hooks';
import { fetchPlans } from '../lib/plans';
import { CreateTripModal } from '../components/coordination/CreateTripModal';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

const ROLE_STYLE = {
  owner: { bg: colors.accent, fg: colors.onAccent },
  editor: { bg: 'rgba(79,163,199,0.16)', fg: colors.accent2 },
  viewer: { bg: colors.bgElevated2, fg: colors.textLo },
};

function fmtRange(a, b) {
  if (!a) return '';
  return b && b !== a ? `${a} → ${b}` : a;
}

// Outings — the single home for everything you've planned: AI/manual budget outings
// AND collaborative trips, in one list. The standalone "Budget" tab folded in here;
// a budget outing is just another kind of planned outing (see [[coordination_engine]]).
export default function TripsScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;
  const { data: trips = [], isLoading: tripsLoading } = useMyTrips(userId);
  const { data: plans = [], isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ['plans', userId ?? null],
    queryFn: () => fetchPlans(userId),
    enabled: !!userId,
  });
  // Refresh budget outings when returning from the planner (a save happens off-screen).
  useFocusEffect(useCallback(() => { if (userId) refetchPlans(); }, [userId, refetchPlans]));
  const [createOpen, setCreateOpen] = useState(false);

  const openTrip = (tr) => navigation.navigate('TripWorkspace', { tripId: tr.id, title: tr.title, myRole: tr.myRole });

  // Auto-archive: a trip whose last date has passed leaves the active list. Dateless
  // trips (and budget outings) stay active.
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const isPastTrip = (tr) => {
    const last = tr.endDate || tr.startDate;
    return !!last && last < todayStr;
  };

  // One merged, tagged list. Active first; within a group, most-recent/soonest first.
  const rows = useMemo(() => {
    const tripRows = trips.map((tr) => ({ kind: 'trip', id: `trip-${tr.id}`, raw: tr, past: isPastTrip(tr), sortKey: tr.startDate || tr.createdAt || '' }));
    const planRows = plans.map((p) => ({ kind: 'plan', id: `plan-${p.id}`, raw: p, past: false, sortKey: p.created_at || '' }));
    return [...tripRows, ...planRows].sort((a, b) => {
      if (a.past !== b.past) return a.past ? 1 : -1;
      return String(b.sortKey).localeCompare(String(a.sortKey));
    });
  }, [trips, plans]);
  const activeRows = rows.filter((r) => !r.past);
  const pastRows = rows.filter((r) => r.past);
  const isLoading = tripsLoading || plansLoading;

  const renderTripCard = (tr, past) => {
    const rs = ROLE_STYLE[tr.myRole] ?? ROLE_STYLE.viewer;
    return (
      <TouchableOpacity key={`trip-${tr.id}`} style={[styles.card, past && styles.cardPast]} onPress={() => openTrip(tr)}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>{tr.title}</AppText>
          {tr.startDate ? <AppText variant="label" color={colors.textLo} style={styles.cardDates}>{fmtRange(tr.startDate, tr.endDate)}</AppText> : null}
        </View>
        <View style={[styles.roleChip, { backgroundColor: rs.bg }]}><AppText variant="caption" color={rs.fg}>{t(`coordination.role_${tr.myRole}`)}</AppText></View>
      </TouchableOpacity>
    );
  };

  const renderPlanCard = (plan, past) => {
    const over = plan.spent > plan.total_budget;
    return (
      <TouchableOpacity key={`plan-${plan.id}`} style={[styles.card, past && styles.cardPast]} onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>{plan.name || 'Outing plan'}</AppText>
          <AppText variant="label" color={colors.textLo} style={styles.cardDates}>
            {plan.itemCount} stop{plan.itemCount === 1 ? '' : 's'} · {plan.spent} / {plan.total_budget} {plan.currency}
          </AppText>
        </View>
        <View style={[styles.roleChip, { backgroundColor: over ? 'rgba(224,90,90,0.16)' : 'rgba(79,163,199,0.16)' }]}>
          <AppText variant="caption" color={over ? colors.danger : colors.accent2}>{over ? 'Over' : 'Budget'}</AppText>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRow = (row, past = false) => (row.kind === 'trip' ? renderTripCard(row.raw, past) : renderPlanCard(row.raw, past));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <AppText variant="title">Outings</AppText>
        {userId ? (
          <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={8}>
            <AppText variant="label" color={colors.accent2}>＋ {t('coordination.newTrip')}</AppText>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Primary CTA — the single "Plan my outing" entry (schedule + budget in one). */}
      {userId ? (
        <TouchableOpacity style={styles.planBanner} onPress={() => navigation.navigate('Architect')} activeOpacity={0.9}>
          <Icon name="spark" size={20} color={colors.accent} fill />
          <View style={{ flex: 1 }}>
            <AppText variant="bodySemi" color={colors.textHi}>Plan an outing</AppText>
            <AppText variant="caption" color={colors.textLo}>Set a budget — we’ll build a day out around you</AppText>
          </View>
          <Icon name="chevronRight" size={18} color={colors.textMute} />
        </TouchableOpacity>
      ) : null}

      {!userId ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo}>{t('community.signInToReview')}</AppText></View>
      ) : isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo} style={styles.emptyText}>{t('coordination.noTrips')}</AppText></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.base }}>
          {activeRows.map((r) => renderRow(r, false))}

          {pastRows.length > 0 ? (
            <>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionHeader}>{t('coordination.pastPlans')}</AppText>
              {pastRows.map((r) => renderRow(r, true))}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  emptyText: { textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  planBanner: { flexDirection: 'row', alignItems: 'center', gap: space.md, margin: space.base, marginBottom: space.sm, padding: space.base, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.accent },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  cardPast: { opacity: 0.55 },
  sectionHeader: { marginTop: space.md, marginBottom: space.sm },
  cardDates: { marginTop: 3 },
  roleChip: { borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 10 },
});
