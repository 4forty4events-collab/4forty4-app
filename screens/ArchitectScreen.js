import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useLocation } from '../providers/LocationProvider';
import { defaultCurrency } from '../lib/plans';
import { VIBES, WHO, WHEN, budgetPresets, vibeByKey, outingTitle } from '../lib/architect/intents';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

// Outing Architect — the flagship entry. Structured intent (who / vibe / budget /
// when / near me) that the composer turns into a real, sequenced outing. Chips over
// free text so the result is solid even with a still-growing catalog.
export default function ArchitectScreen({ navigation }) {
  const { market } = useMarket();
  const { coords, request } = useLocation();
  const currency = defaultCurrency(market);
  const presets = budgetPresets(market);

  const [who, setWho] = useState(null);
  const [vibe, setVibe] = useState('surprise');
  const [when, setWhen] = useState('tonight');
  // Budget is a free-form estimate; the presets are quick-fills for the same field.
  const [budgetText, setBudgetText] = useState(String(presets[1].value));
  const budgetValue = parseInt(budgetText, 10) || 0;
  const [nearMe, setNearMe] = useState(!!coords);

  const toggleNear = () => {
    if (!nearMe && !coords) { request?.(); }
    setNearMe((v) => !v);
  };

  const plan = () => {
    navigation.navigate('OutingResult', {
      spec: {
        market,
        planType: 'single_day',
        budget: budgetValue,
        currency,
        categories: vibeByKey(vibe).categories,
        near: nearMe && coords ? { lat: coords.lat, lng: coords.lng } : null,
        who, vibe, when,
        title: outingTitle(who, vibe),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">Plan an outing</AppText>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Icon name="spark" size={26} color={colors.accent2} fill />
          <AppText variant="display" style={styles.heroTitle}>Tell us the vibe.</AppText>
          <AppText variant="body" color={colors.textLo}>We’ll build a real outing from places around you — your budget, tonight.</AppText>
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>WHO’S COMING</AppText>
        <View style={styles.wrap}>
          {WHO.map((w) => (
            <Chip key={w.key} label={`${w.emoji} ${w.label}`} selected={who === w.key} onPress={() => setWho(who === w.key ? null : w.key)} />
          ))}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>THE VIBE</AppText>
        <View style={styles.wrap}>
          {VIBES.map((v) => (
            <Chip key={v.key} label={`${v.emoji} ${v.label}`} selected={vibe === v.key} onPress={() => setVibe(v.key)} />
          ))}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>ESTIMATED BUDGET PER PERSON ({currency})</AppText>
        <View style={styles.budgetInputRow}>
          <AppText variant="bodySemi" color={colors.textLo}>{currency}</AppText>
          <TextInput
            style={styles.budgetInput}
            value={budgetText}
            onChangeText={(txt) => setBudgetText(txt.replace(/[^0-9]/g, '').slice(0, 7))}
            keyboardType="number-pad"
            placeholder="Enter amount"
            placeholderTextColor={colors.textMute}
            accessibilityLabel="Estimated budget per person"
          />
          <AppText variant="caption" color={colors.textMute}>per person</AppText>
        </View>
        <View style={styles.wrap}>
          {presets.map((b) => (
            <Chip key={b.value} label={b.label} selected={budgetValue === b.value} onPress={() => setBudgetText(String(b.value))} />
          ))}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.label}>WHEN</AppText>
        <View style={styles.wrap}>
          {WHEN.map((w) => (
            <Chip key={w.key} label={w.label} selected={when === w.key} onPress={() => setWhen(w.key)} />
          ))}
        </View>

        <TouchableOpacity style={[styles.nearRow, nearMe && styles.nearRowOn]} onPress={toggleNear} activeOpacity={0.8}>
          <Icon name="pin" size={18} color={nearMe ? colors.accent2 : colors.textLo} fill={nearMe} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodySemi" color={nearMe ? colors.textHi : colors.textLo}>Near me</AppText>
            <AppText variant="caption" color={colors.textMute}>{coords ? 'Prioritize places a short hop away' : 'Enable location to prioritize nearby'}</AppText>
          </View>
          <View style={[styles.switch, nearMe && styles.switchOn]}><View style={[styles.knob, nearMe && styles.knobOn]} /></View>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Plan my outing" icon="✨" onPress={plan} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs },
  body: { paddingHorizontal: space.base, paddingBottom: space.xxl },
  hero: { gap: space.xs, paddingVertical: space.md },
  heroTitle: { marginTop: space.xs },
  label: { marginTop: space.lg, marginBottom: space.sm },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm, paddingHorizontal: space.base, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  budgetInput: { flex: 1, color: colors.textHi, fontSize: 20, fontFamily: fonts.displaySemi, padding: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  nearRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, padding: space.base, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  nearRowOn: { borderColor: colors.accent2 },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.line, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
