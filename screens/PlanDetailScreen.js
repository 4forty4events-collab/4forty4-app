import React, { useCallback, useState } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { normalizeVenue, normalizeEvent } from '../lib/feed';
import { fetchPlan, fetchPlanItems, removePlanItem, autoBuildPlan, priceEstimateFor } from '../lib/plans';
import { FeedCard } from '../components/FeedCard';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';

function planTypeLabel(t) {
  return t === 'trip' ? 'Multi-day' : 'Single Day';
}

export default function PlanDetailScreen({ route, navigation }) {
  const { planId } = route.params;
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, its] = await Promise.all([
        fetchPlan(planId),
        fetchPlanItems(planId, normalizeVenue, normalizeEvent),
      ]);
      setPlan(p);
      setItems(its);
    } catch (e) {
      setError(e.message ?? 'Could not load this plan');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const runAutoBuild = () => {
    const go = async () => {
      setBuilding(true);
      try {
        const result = await autoBuildPlan(plan, {}, normalizeVenue, normalizeEvent);
        await load();
        Alert.alert('Auto-build', result.message);
      } catch (e) {
        Alert.alert('Auto-build failed', String(e.message ?? e));
      } finally {
        setBuilding(false);
      }
    };
    // Re-run replaces previously auto-added items; manual picks are kept.
    const hasAuto = items.some((it) => it.source === 'auto');
    if (hasAuto) {
      Alert.alert('Rebuild plan?', 'This replaces the auto-added items and keeps anything you added yourself.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rebuild', onPress: go },
      ]);
    } else {
      go();
    }
  };

  const remove = (item) => {
    Alert.alert('Remove from plan', `Remove "${item.listing.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          // Optimistic: drop it locally, revert on error.
          const prev = items;
          setItems((cur) => cur.filter((x) => x.itemId !== item.itemId));
          try {
            await removePlanItem(item.itemId);
          } catch (e) {
            setItems(prev);
            Alert.alert('Could not remove', String(e.message ?? e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (error || !plan) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error ?? 'Plan not found'}</AppText>
        <Button label="Go back" variant="secondary" full={false} onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const spent = items.reduce((sum, it) => sum + it.estCost, 0);
  const remaining = plan.total_budget - spent;
  const over = remaining < 0;
  const statusColor = over ? colors.danger : colors.success;

  const header = (
    <View>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <AppText variant="label" color={colors.textHi}>‹ Plans</AppText>
        </TouchableOpacity>
        <View style={styles.typePill}>
          <AppText variant="caption" color={colors.textLo}>{planTypeLabel(plan.plan_type)}</AppText>
        </View>
      </View>

      <AppText variant="title" style={styles.title}>{plan.name || planTypeLabel(plan.plan_type)}</AppText>

      <View style={[styles.budgetCard, { borderColor: over ? 'rgba(229,96,94,0.4)' : 'rgba(79,190,143,0.4)' }]}>
        <View style={styles.budgetRow}>
          <AppText variant="body" color={colors.textLo}>Spent</AppText>
          <AppText variant="bodySemi">{spent} {plan.currency}</AppText>
        </View>
        <View style={styles.budgetRow}>
          <AppText variant="body" color={colors.textLo}>Budget</AppText>
          <AppText variant="bodySemi">{plan.total_budget} {plan.currency}</AppText>
        </View>
        <View style={styles.budgetDivider} />
        <View style={styles.budgetRow}>
          <AppText variant="heading" color={statusColor}>{over ? 'Over budget' : 'Buffer left'}</AppText>
          <AppText variant="heading" color={statusColor}>{over ? `−${Math.abs(remaining)}` : `${remaining}`} {plan.currency}</AppText>
        </View>
      </View>

      {over && (
        <AppText variant="label" color={colors.danger} style={styles.warning}>
          You're over budget. Remove an item or raise the budget to bring it back in line.
        </AppText>
      )}

      <Button
        label={items.some((it) => it.source === 'auto') ? '↻ Rebuild auto plan' : '✨ Auto-build a plan'}
        loading={building}
        onPress={runAutoBuild}
        style={styles.autoButton}
      />

      <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>
        {items.length} ITEM{items.length === 1 ? '' : 'S'}
      </AppText>
    </View>
  );

  const empty = (
    <View style={styles.emptyBox}>
      <AppText variant="heading" style={styles.centerText}>No items yet</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.centerText}>
        Open any {plan.plan_type === 'trip' ? 'multi-day' : 'single-day'} listing and tap "Add to plan", or start from your Saved.
      </AppText>
      <Button label="Browse listings" full={false} onPress={() => navigation.navigate('Main', { screen: 'BrowseTab' })} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.itemId}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.itemWrap}>
            <FeedCard
              item={item.listing}
              imageHeight={140}
              onPress={() => navigation.navigate('ListingDetail', { item: item.listing })}
            />
            <View style={styles.itemFooter}>
              <AppText variant="label">
                {item.estCost} {plan.currency}
                {item.source === 'auto' ? '  · auto' : ''}
              </AppText>
              <TouchableOpacity onPress={() => remove(item)} hitSlop={8}>
                <AppText variant="label" color={colors.danger}>Remove</AppText>
              </TouchableOpacity>
            </View>

            {/* Transparency: the actual dishes auto-build picked (persisted at
                build time), or a labeled estimate when there's no composed meal. */}
            {(() => {
              if (item.breakdown?.length) {
                return (
                  <View style={styles.breakdown}>
                    {item.breakdown.map((it, i) => (
                      <View key={i} style={styles.breakdownRow}>
                        <AppText variant="label" color={colors.textLo} numberOfLines={1} style={styles.breakdownName}>{it.name || 'Item'}</AppText>
                        <AppText variant="label">{it.price} {plan.currency}</AppText>
                      </View>
                    ))}
                    <AppText variant="caption" color={colors.textMute} style={styles.breakdownNote}>Composed meal · rebuild for a different pick</AppText>
                  </View>
                );
              }
              const b = priceEstimateFor(item.listing);
              const range = b.max ? `${b.min ?? '—'}–${b.max}` : `${b.min ?? '—'}`;
              return (
                <AppText variant="caption" color={colors.textMute} style={styles.breakdownEstimate}>
                  Est. {range} {plan.currency} · {b.hasMenu ? 'per-person price' : 'price estimate, no menu'}
                </AppText>
              );
            })()}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  listContent: { padding: space.base, paddingBottom: space.huge },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  typePill: { backgroundColor: colors.bgElevated2, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  title: { marginBottom: space.base },
  budgetCard: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: space.base, borderWidth: 1 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  budgetDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: space.sm },
  warning: { marginTop: space.sm, lineHeight: 19 },
  autoButton: { marginTop: space.base },
  sectionLabel: { marginTop: space.xl, marginBottom: space.sm },
  itemWrap: { marginBottom: space.lg },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingTop: space.sm },
  breakdown: { marginTop: space.sm, marginHorizontal: 4, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.sm },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 2 },
  breakdownName: { flex: 1 },
  breakdownNote: { marginTop: 6 },
  breakdownEstimate: { marginTop: space.sm, marginHorizontal: 4, fontStyle: 'italic' },
  emptyBox: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.base, gap: space.md },
});
