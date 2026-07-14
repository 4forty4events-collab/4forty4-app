import React, { useCallback, useState } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSession } from '../providers/SessionProvider';
import { fetchPlans, addPlanItem, planTypeForDuration } from '../lib/plans';
import { recordInteraction } from '../lib/discovery/interactions';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';

function planTypeLabel(t) {
  return t === 'trip' ? 'Multi-day' : 'Single Day';
}

export default function AddToPlanScreen({ route, navigation }) {
  const { item } = route.params; // a normalized listing
  const { session } = useSession();
  // The listing's duration decides which kind of plan it can join. A day listing
  // only fits Single-Day plans; a multi-day one only fits Trips. They never mix.
  const requiredType = planTypeForDuration(item.durationDays);

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await fetchPlans(session.user.id);
      setPlans(all.filter((p) => p.plan_type === requiredType));
    } catch (e) {
      setError(e.message ?? 'Could not load your plans');
    } finally {
      setLoading(false);
    }
  }, [session, requiredType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async (plan) => {
    try {
      const result = await addPlanItem(plan.id, item, 'manual');
      if (result === 'duplicate') {
        Alert.alert('Already in plan', `"${item.title}" is already in ${plan.name || planTypeLabel(plan.plan_type)}.`);
        return;
      }
      recordInteraction(session.user.id, item, 'plan_add');
      Alert.alert('Added', `"${item.title}" added to ${plan.name || planTypeLabel(plan.plan_type)}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not add', String(e.message ?? e));
    }
  };

  const createForThis = () => {
    navigation.replace('CreatePlan', { planType: requiredType });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <AppText variant="label" color={colors.textHi}>‹ Back</AppText>
        </TouchableOpacity>
      </View>
      <AppText variant="title" style={styles.title}>Add to plan</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.subtitle}>
        "{item.title}" fits {planTypeLabel(requiredType)} plans
        {item.pricePerPerson != null ? ` · ${item.pricePerPerson} ${item.currency ?? ''}`.trimEnd() : ' · no price set'}.
      </AppText>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : error ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo}>{error}</AppText></View>
      ) : plans.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="heading" style={styles.centerText}>No {planTypeLabel(requiredType)} plans yet</AppText>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>Create one to add this listing to it.</AppText>
          <Button label={`Create a ${planTypeLabel(requiredType)} plan`} full={false} onPress={createForThis} />
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <TouchableOpacity style={styles.newRow} onPress={createForThis}>
              <AppText variant="label" color={colors.accent}>+ New {planTypeLabel(requiredType)} plan</AppText>
            </TouchableOpacity>
          }
          renderItem={({ item: plan }) => (
            <TouchableOpacity style={styles.planRow} onPress={() => add(plan)} activeOpacity={0.85}>
              <AppText variant="heading" style={styles.planName}>{plan.name || planTypeLabel(plan.plan_type)}</AppText>
              <AppText variant="label" color={colors.textLo}>
                {plan.itemCount} item{plan.itemCount === 1 ? '' : 's'} · {plan.spent} / {plan.total_budget} {plan.currency}
              </AppText>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  topBar: { paddingHorizontal: space.base, paddingTop: space.md },
  title: { paddingHorizontal: space.base, marginTop: space.sm },
  subtitle: { paddingHorizontal: space.base, marginTop: 6, marginBottom: space.md, lineHeight: 20 },
  listContent: { padding: space.base, paddingTop: space.xs },
  planRow: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  planName: { marginBottom: 4 },
  newRow: { paddingVertical: 14, alignItems: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed' },
});
