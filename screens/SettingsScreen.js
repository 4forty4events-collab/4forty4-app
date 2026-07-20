import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, Switch, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { supabase } from '../lib/supabase';
import { deleteAccount } from '../lib/profile/profileRepository';
import { useSettings, useUpdateSettings } from '../lib/profile/hooks';
import { SUPPORTED_LANGUAGES } from '../lib/i18n/strings';
import { MARKETS } from '../lib/markets';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';

// Hoisted (not defined inside render) so toggling one Switch doesn't remount all
// the others.
function SettingRow({ label, description, value, onValueChange }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="bodySemi">{label}</AppText>
        {description ? <AppText variant="label" color={colors.textLo} style={styles.rowDesc}>{description}</AppText> : null}
      </View>
      <Switch value={!!value} onValueChange={onValueChange} trackColor={{ true: colors.accent, false: colors.bgElevated2 }} thumbColor="#fff" />
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { session } = useSession();
  const { t, language, setLanguage } = useLocale();
  const { market, setMarket } = useMarket();
  const userId = session?.user?.id ?? null;
  const { data: s, isLoading } = useSettings(userId);
  const updateSettings = useUpdateSettings(userId);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Hydrate the render language from the saved preference (cross-device) once
  // settings load. The switcher writes both context + DB, so they stay in sync.
  useEffect(() => {
    if (s?.appLanguage && s.appLanguage !== language) setLanguage(s.appLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.appLanguage]);

  const set = (key) => (value) => updateSettings.mutate({ [key]: value });

  const changeLanguage = (lang) => {
    setLanguage(lang);
    if (userId) updateSettings.mutate({ appLanguage: lang });
  };

  const signOut = async () => { await supabase.auth.signOut(); navigation.navigate('Main'); };

  const doDelete = async () => {
    setDeleting(true); setError(null);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      navigation.navigate('Main');
    } catch (e) {
      setDeleting(false);
      setError(e?.message ?? t('settings.deleteError'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <AppText variant="label" color={colors.textHi}>‹ {t('common.back')}</AppText>
        </TouchableOpacity>
        <AppText variant="heading">{t('settings.title')}</AppText>
        <View style={{ width: 48 }} />
      </View>

      {isLoading || !s ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          {/* Preferences: language + country */}
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('settings.preferences')}</AppText>
          <View style={styles.card}>
            <View style={styles.prefBlock}>
              <AppText variant="bodySemi">{t('settings.language')}</AppText>
              <View style={styles.segRow}>
                {SUPPORTED_LANGUAGES.map((l) => {
                  const on = language === l.code;
                  return (
                    <TouchableOpacity key={l.code} style={[styles.seg, on && styles.segOn]} onPress={() => changeLanguage(l.code)}>
                      <AppText variant="label" color={on ? colors.onAccent : colors.textLo}>{l.label}</AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.prefBlock}>
              <AppText variant="bodySemi" style={{ marginBottom: 6 }}>{t('settings.country')}</AppText>
              {MARKETS.map((m) => {
                const selected = market === m.code;
                return (
                  <TouchableOpacity
                    key={m.code}
                    disabled={!m.live}
                    activeOpacity={m.live ? 0.6 : 1}
                    style={styles.marketRow}
                    onPress={() => m.live && setMarket(m.code)}
                  >
                    <AppText style={styles.flag}>{m.flag}</AppText>
                    <AppText variant="bodyMed" color={m.live ? colors.textHi : colors.textMute} style={styles.marketLabel}>{m.label}</AppText>
                    {!m.live
                      ? <AppText variant="caption" color={colors.star} style={styles.soon}>{t('common.comingSoon')}</AppText>
                      : selected ? <AppText style={styles.check} color={colors.success}>✓</AppText> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Privacy */}
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('settings.privacy')}</AppText>
          <View style={styles.card}>
            <SettingRow label={t('settings.publicProfile')} description={t('settings.publicProfileDesc')}
              value={s.profileVisibility === 'public'}
              onValueChange={(v) => updateSettings.mutate({ profileVisibility: v ? 'public' : 'private' })} />
            <View style={styles.divider} />
            <SettingRow label={t('settings.shareActivity')} description={t('settings.shareActivityDesc')} value={s.shareActivity} onValueChange={set('shareActivity')} />
            <View style={styles.divider} />
            <SettingRow label={t('settings.personalizedRecs')} description={t('settings.personalizedRecsDesc')} value={s.personalizedRecs} onValueChange={set('personalizedRecs')} />
          </View>

          {/* Notifications */}
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('settings.notifications')}</AppText>
          <View style={styles.card}>
            <SettingRow label={t('settings.eventReminders')} description={t('settings.eventRemindersDesc')} value={s.notifyEventReminders} onValueChange={set('notifyEventReminders')} />
            <View style={styles.divider} />
            <SettingRow label={t('settings.nearbyAlerts')} description={t('settings.nearbyAlertsDesc')} value={s.notifyNearby} onValueChange={set('notifyNearby')} />
            <View style={styles.divider} />
            <SettingRow label={t('settings.recommendations')} description={t('settings.recommendationsDesc')} value={s.notifyRecommendations} onValueChange={set('notifyRecommendations')} />
            <View style={styles.divider} />
            <SettingRow label={t('settings.organizerUpdates')} description={t('settings.organizerUpdatesDesc')} value={s.notifyOrganizerUpdates} onValueChange={set('notifyOrganizerUpdates')} />
          </View>

          {/* Safety & Support */}
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('safety.title')}</AppText>
          <View style={styles.card}>
            <TouchableOpacity style={styles.accountRow} onPress={() => navigation.navigate('Safety')}>
              <AppText variant="bodySemi">{t('safety.directory')}</AppText>
            </TouchableOpacity>
          </View>

          {/* About & Help — plain English for now; these two screens are not yet
              translated, so they deliberately don't go through t(). */}
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>ABOUT & HELP</AppText>
          <View style={styles.card}>
            <TouchableOpacity style={styles.accountRow} onPress={() => navigation.navigate('Support')}>
              <AppText variant="bodySemi">Help & Support</AppText>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.accountRow} onPress={() => navigation.navigate('About')}>
              <AppText variant="bodySemi">About 4Forty4</AppText>
            </TouchableOpacity>
          </View>

          {/* Account */}
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('settings.account')}</AppText>
          <View style={styles.card}>
            <TouchableOpacity style={styles.accountRow} onPress={signOut}>
              <AppText variant="bodySemi">{t('settings.signOut')}</AppText>
            </TouchableOpacity>
          </View>

          {!confirming ? (
            <TouchableOpacity style={styles.dangerBtn} onPress={() => setConfirming(true)}>
              <AppText variant="bodySemi" color={colors.danger}>{t('settings.deleteAccount')}</AppText>
            </TouchableOpacity>
          ) : (
            <View style={styles.confirmBox}>
              <AppText variant="heading" color={colors.danger} style={styles.confirmTitle}>{t('settings.deleteTitle')}</AppText>
              <AppText variant="body" color={colors.textLo} style={styles.confirmBody}>{t('settings.deleteBody')}</AppText>
              {error ? <AppText variant="label" color={colors.danger} style={styles.confirmError}>{error}</AppText> : null}
              <View style={styles.confirmActions}>
                <Button label={t('common.cancel')} variant="secondary" onPress={() => { setConfirming(false); setError(null); }} disabled={deleting} style={styles.confirmBtn} />
                <Button label={t('settings.deleteEverything')} variant="danger" textColor="#fff" loading={deleting} onPress={doDelete} style={[styles.confirmBtn, styles.deleteFill]} />
              </View>
            </View>
          )}

          <View style={{ height: space.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  content: { padding: space.base, paddingBottom: space.huge },
  sectionLabel: { marginTop: space.lg, marginBottom: space.sm },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14, gap: space.md },
  rowText: { flex: 1 },
  rowDesc: { marginTop: 2, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 14 },

  prefBlock: { paddingVertical: 14, paddingHorizontal: 14 },
  segRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  seg: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, paddingVertical: 9, alignItems: 'center' },
  segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  marketRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11 },
  flag: { fontSize: 20 },
  marketLabel: { flex: 1 },
  soon: { backgroundColor: 'rgba(240,181,74,0.14)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden' },
  check: { fontSize: 17 },

  accountRow: { paddingVertical: 15, paddingHorizontal: 14 },
  dangerBtn: { marginTop: space.xl, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,96,94,0.4)', alignItems: 'center' },
  confirmBox: { marginTop: space.xl, backgroundColor: 'rgba(229,96,94,0.1)', borderWidth: 1, borderColor: 'rgba(229,96,94,0.35)', borderRadius: radius.lg, padding: space.base },
  confirmTitle: { marginBottom: 6 },
  confirmBody: { lineHeight: 19, marginBottom: space.md },
  confirmError: { marginBottom: space.sm },
  confirmActions: { flexDirection: 'row', gap: space.sm },
  confirmBtn: { flex: 1 },
  deleteFill: { backgroundColor: colors.danger, borderColor: colors.danger },
});
