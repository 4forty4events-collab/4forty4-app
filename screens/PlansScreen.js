import React, { useCallback, useState } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSession } from '../providers/SessionProvider';
import { supabase } from '../lib/supabase';
import { fetchPlans } from '../lib/plans';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';

function planTypeLabel(t) {
  return t === 'trip' ? 'Trip' : 'Single Day';
}

function PlanRow({ plan, onPress }) {
  const over = plan.spent > plan.total_budget;
  return (
    <TouchableOpacity style={styles.planRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.planRowTop}>
        <AppText variant="heading" numberOfLines={1} style={styles.planName}>{plan.name || planTypeLabel(plan.plan_type)}</AppText>
        <View style={styles.typePill}>
          <AppText variant="caption" color={colors.textLo}>{planTypeLabel(plan.plan_type)}</AppText>
        </View>
      </View>
      <AppText variant="label" color={colors.textLo} style={styles.planMeta}>
        {plan.itemCount} item{plan.itemCount === 1 ? '' : 's'} · {plan.spent} / {plan.total_budget} {plan.currency}
      </AppText>
      <AppText variant="label" color={over ? colors.danger : colors.success}>
        {over
          ? `Over by ${plan.spent - plan.total_budget} ${plan.currency}`
          : `${plan.total_budget - plan.spent} ${plan.currency} left`}
      </AppText>
    </TouchableOpacity>
  );
}

export default function PlansScreen({ navigation }) {
  const { session, loading: sessionLoading } = useSession();
  const [plans, setPlans] = useState([]);
  const [hasSaved, setHasSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!session) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, savedCount] = await Promise.all([
        fetchPlans(session.user.id),
        supabase
          .from('saved_items')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id),
      ]);
      setPlans(data);
      setHasSaved((savedCount.count ?? 0) > 0);
    } catch (e) {
      setError(e.message ?? 'Could not load your plans');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!session && !sessionLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="title" style={styles.centerText}>Sign in to plan an outing</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>Set a budget and let 4forty4 help you spend it well.</AppText>
        <Button label="Sign in" full={false} onPress={() => navigation.navigate('SignIn')} />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error}</AppText>
        <Button label="Retry" variant="secondary" full={false} onPress={load} />
      </SafeAreaView>
    );
  }

  // Empty / launcher state.
  if (plans.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="title" style={styles.centerText}>Plan a budget outing</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>
          Pick a budget, choose Single Day or Trip, then add places and events — or let auto-build fill it for you.
        </AppText>
        <Button label="Create a plan" full={false} onPress={() => navigation.navigate('CreatePlan')} />
        {hasSaved && (
          <Button label="Start from your Saved" variant="secondary" full={false} onPress={() => navigation.navigate('CreatePlan', { fromSaved: true })} />
        )}
      </SafeAreaView>
    );
  }

  // Populated state.
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <AppText variant="title">Plans</AppText>
        <Button label="+ New plan" full={false} onPress={() => navigation.navigate('CreatePlan')} style={styles.newButton} />
      </View>
      <FlatList
        style={styles.list}
        data={plans}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PlanRow plan={item} onPress={() => navigation.navigate('PlanDetail', { planId: item.id })} />
        )}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.base, paddingTop: space.base, paddingBottom: space.sm },
  newButton: { paddingVertical: 9, paddingHorizontal: 14 },
  list: { flex: 1 },
  listContent: { padding: space.base, paddingTop: space.sm, gap: space.md },
  planRow: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  planRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planName: { flexShrink: 1 },
  typePill: { backgroundColor: colors.bgElevated2, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8, marginLeft: space.sm },
  planMeta: { marginBottom: 4 },
});
