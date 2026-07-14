import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { normalizeVenue, normalizeEvent } from '../lib/feed';
import { fetchSavedItems } from '../lib/saves';
import { createPlan, defaultCurrency, isEligible, addPlanItem, autoBuildPlan } from '../lib/plans';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';

export default function CreatePlanScreen({ route, navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const fromSaved = !!route.params?.fromSaved;
  // Caller can pre-pick the type (e.g. an Add-to-plan flow that needs a Trip).
  const initialType = route.params?.planType ?? 'single_day';

  const [planType, setPlanType] = useState(initialType);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency(market));
  const [name, setName] = useState('');
  // null | 'manual' | 'auto' — also tells us which button to spin.
  const [saving, setSaving] = useState(null);

  // mode 'manual' = empty plan the user fills; 'auto' = create AND immediately
  // run auto-build so they land on a filled plan in one tap.
  const create = async (mode) => {
    const total = Number(budget);
    if (!budget || Number.isNaN(total) || total <= 0) {
      Alert.alert('Enter a budget', 'How much do you want to spend?');
      return;
    }
    setSaving(mode);
    try {
      const plan = await createPlan(session.user.id, {
        name,
        totalBudget: total,
        currency,
        market,
        planType,
      });

      // "Start from your Saved": seed the new plan with eligible saved listings.
      if (fromSaved) {
        const saved = await fetchSavedItems(session.user.id, normalizeVenue, normalizeEvent);
        const eligible = saved.filter((l) => isEligible(l, planType));
        for (const listing of eligible) {
          await addPlanItem(plan.id, listing, 'manual');
        }
      }

      // Auto path: same algorithm the in-plan button uses, just run at create
      // time. It fills around any saved items already seeded above.
      let autoMessage = null;
      if (mode === 'auto') {
        const result = await autoBuildPlan(plan, {}, normalizeVenue, normalizeEvent);
        autoMessage = result.message;
      }

      navigation.replace('PlanDetail', { planId: plan.id });
      // Surface the friendly few-options/empty-catalog note after landing.
      if (autoMessage) {
        setTimeout(() => Alert.alert('Auto-build', autoMessage), 350);
      }
    } catch (e) {
      setSaving(null);
      Alert.alert('Could not create plan', String(e.message ?? e));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="title" style={styles.title}>New plan</AppText>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>PLAN TYPE</AppText>
        <AppText variant="label" color={colors.textLo} style={styles.hint}>
          Single Day plans only fit day outings; Multi-day plans only fit multi-day excursions. They never mix.
        </AppText>
        <View style={styles.row}>
          {[
            { key: 'single_day', label: 'Single Day' },
            { key: 'trip', label: 'Multi-day' },
          ].map((tt) => {
            const on = planType === tt.key;
            return (
              <TouchableOpacity key={tt.key} style={[styles.bigChip, on && styles.bigChipActive]} onPress={() => setPlanType(tt.key)}>
                <AppText variant="bodySemi" color={on ? colors.onAccent : colors.textHi}>{tt.label}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>BUDGET</AppText>
        <TextInput
          style={styles.input}
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          placeholder="e.g. 5000"
          placeholderTextColor={colors.textMute}
        />

        <AppText variant="caption" color={colors.textMute} style={styles.label}>CURRENCY</AppText>
        <View style={styles.row}>
          {['DZD', 'USD'].map((c) => {
            const on = currency === c;
            return (
              <TouchableOpacity key={c} style={[styles.chip, on && styles.chipActive]} onPress={() => setCurrency(c)}>
                <AppText variant="label" color={on ? colors.onAccent : colors.textHi}>{c}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>NAME (OPTIONAL)</AppText>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={planType === 'trip' ? 'Weekend in Tipaza' : 'Saturday out'}
          placeholderTextColor={colors.textMute}
        />

        <Button label="✨ Auto-build my plan" loading={saving === 'auto'} disabled={!!saving} onPress={() => create('auto')} style={styles.autoButton} />
        <AppText variant="label" color={colors.textLo} style={styles.autoHint}>
          Let 4forty4 fill the plan with a sensible set that fits your budget. You can tweak it after.
        </AppText>

        <Button label="Create empty plan" variant="secondary" loading={saving === 'manual'} disabled={!!saving} onPress={() => create('manual')} style={styles.createButton} />
        <AppText variant="label" color={colors.textLo} style={styles.createHint}>Start blank and add listings yourself.</AppText>
      </ScrollView>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  content: { padding: space.xl, paddingBottom: space.huge },
  title: { marginBottom: space.base },
  label: { marginTop: space.lg, marginBottom: 6 },
  hint: { marginBottom: space.sm, lineHeight: 17 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  row: { flexDirection: 'row', gap: space.sm },
  bigChip: { flex: 1, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  bigChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 16 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  autoButton: { marginTop: space.xl },
  autoHint: { textAlign: 'center', marginTop: space.sm, lineHeight: 17 },
  createButton: { marginTop: space.base },
  createHint: { textAlign: 'center', marginTop: space.sm },
});
