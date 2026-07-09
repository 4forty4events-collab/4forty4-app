import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useGoogleAuth } from '../../lib/auth/useGoogleAuth';
import { useLocale } from '../../providers/LocaleProvider';
import { AppText, colors, space, radius } from '../../lib/theme';

// Premium in-tab auth gateway (dark). Continue with Google is the primary action;
// a quiet "Continue as guest" sits beneath it. On successful sign-in the parent
// (Profile tab) hot-swaps to the dashboard via the session state change.
export function AuthGateway({ onGuest }) {
  const { t } = useLocale();
  const { signIn, loading, error } = useGoogleAuth();

  return (
    <View style={styles.wrap}>
      <View style={styles.brandBlock}>
        <View style={styles.logoDot}><AppText style={styles.logoMark}>4</AppText></View>
        <AppText variant="title" style={styles.title}>{t('gateway.title')}</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.subtitle}>{t('gateway.subtitle')}</AppText>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.googleBtn} onPress={signIn} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={colors.textHi} />
          ) : (
            <>
              <AppText style={styles.googleG} color="#6AA9FF">G</AppText>
              <AppText variant="bodySemi">{t('gateway.continueGoogle')}</AppText>
            </>
          )}
        </TouchableOpacity>

        {error ? <AppText variant="label" color={colors.danger} style={styles.error}>{error}</AppText> : null}

        <TouchableOpacity style={styles.guestBtn} onPress={onGuest} disabled={loading} hitSlop={8}>
          <AppText variant="bodyMed" color={colors.textLo}>{t('gateway.continueGuest')}</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, backgroundColor: colors.bgBase },
  brandBlock: { alignItems: 'center', marginBottom: 40 },
  logoDot: { width: 68, height: 68, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  logoMark: { color: colors.onAccent, fontSize: 34, fontFamily: 'Fraunces_700Bold' },
  title: { textAlign: 'center', marginBottom: space.sm },
  subtitle: { textAlign: 'center', lineHeight: 22, paddingHorizontal: 6 },
  actions: { gap: space.base },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.lg, paddingVertical: 16 },
  googleG: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  error: { lineHeight: 19 },
  guestBtn: { alignItems: 'center', paddingVertical: space.sm },
});
