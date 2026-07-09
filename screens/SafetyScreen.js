import React from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useSafetyContacts } from '../lib/safety/hooks';
import { AppText, colors, space, radius } from '../lib/theme';

const CAT_ICON = {
  police: '🚓', ambulance: '🚑', fire: '🚒', civil_protection: '🛟', emergency: '🆘',
  embassy: '🏛', health: '⚕️', womens_helpline: '💜', child_helpline: '🧒', roadside: '🛠', other: '📞',
};

// Emergency directory: market-scoped safety numbers as prominent tap-to-call cards.
export default function SafetyScreen({ navigation }) {
  const { market } = useMarket();
  const { t } = useLocale();
  const { data: contacts = [], isLoading } = useSafetyContacts(market);
  const call = (phone) => Linking.openURL(`tel:${phone}`);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
        <AppText variant="heading">{t('safety.title')}</AppText>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('safety.directory')} · {market}</AppText>
          {contacts.length === 0 ? (
            <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('safety.noContacts')}</AppText>
          ) : contacts.map((c) => (
            <TouchableOpacity key={c.id} style={styles.card} onPress={() => call(c.phone)} activeOpacity={0.8}>
              <AppText style={styles.icon}>{CAT_ICON[c.category] ?? '📞'}</AppText>
              <View style={styles.body}>
                <AppText variant="heading" numberOfLines={1}>{c.name}</AppText>
                <AppText variant="label" color={colors.textLo} style={styles.cat}>{t(`safety.cat_${c.category}`)}{c.description ? ` · ${c.description}` : ''}</AppText>
              </View>
              <View style={styles.callPill}>
                <AppText color="#fff" style={styles.callPhone}>{c.phone}</AppText>
                <AppText color="#ffd9e0" style={styles.callHint}>{t('safety.callHint')}</AppText>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 30 }} />
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
  content: { padding: space.base },
  sectionLabel: { marginBottom: space.md },
  empty: { paddingVertical: space.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  icon: { fontSize: 28 },
  body: { flex: 1 },
  cat: { marginTop: 2 },
  callPill: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: 14, minWidth: 66 },
  callPhone: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  callHint: { fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 1 },
});
