import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { LIVE_MARKETS } from '../lib/markets';
import { defaultCurrency } from '../lib/plans';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { BrandLogo } from '../components/common/BrandLogo';

// Getting-started country selector (dark). Shown once, right after the auth/guest
// entry decision, whenever no market has been saved yet (MarketProvider.needsOnboarding).
// Picking a country persists it as the permanent default market and the app root
// then swaps this card for the primary feed.
export default function OnboardingScreen() {
  const { t } = useLocale();
  const { setMarket } = useMarket();
  const [selected, setSelected] = useState(LIVE_MARKETS[0]?.code ?? 'DZ');
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await setMarket(selected);
    } catch (e) {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.brandBlock}>
          <BrandLogo variant="symbol" size="lg" style={styles.logo} />
          <AppText variant="title" style={styles.title}>{t('onboarding.title')}</AppText>
          <AppText variant="bodySemi" color={colors.textHi} style={styles.tagline}>{t('onboarding.tagline')}</AppText>
          <AppText variant="body" color={colors.textLo} style={styles.subtitle}>{t('onboarding.subtitle')}</AppText>
        </View>

        <View style={styles.options}>
          {LIVE_MARKETS.map((m) => {
            const on = selected === m.code;
            return (
              <TouchableOpacity key={m.code} activeOpacity={0.8} style={[styles.card, on && styles.cardOn]} onPress={() => setSelected(m.code)}>
                <AppText style={styles.flag}>{m.flag}</AppText>
                <View style={styles.cardText}>
                  <AppText variant="heading" color={on ? colors.onAccent : colors.textHi}>{m.label}</AppText>
                  <AppText variant="label" color={on ? colors.onAccent : colors.textLo} style={styles.cardMeta}>{defaultCurrency(m.code)}</AppText>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <AppText style={styles.radioTick} color={colors.accent}>✓</AppText> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Button label={t('onboarding.cta')} loading={saving} onPress={confirm} style={styles.cta} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: 28 },
  body: { flex: 1, justifyContent: 'center' },
  brandBlock: { alignItems: 'center', marginBottom: 36 },
  // Size comes from BrandLogo's `lg` preset; only spacing is set here.
  logo: { marginBottom: 22 },
  title: { textAlign: 'center', marginBottom: space.sm },
  tagline: { textAlign: 'center', lineHeight: 22, marginBottom: space.sm },
  subtitle: { textAlign: 'center', lineHeight: 22 },
  options: { gap: space.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.base, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: 16 },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  flag: { fontSize: 26 },
  cardText: { flex: 1 },
  cardMeta: { marginTop: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.textMute, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.onAccent, backgroundColor: colors.onAccent },
  radioTick: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  cta: { marginBottom: space.md },
});
