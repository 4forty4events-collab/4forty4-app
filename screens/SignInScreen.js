import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { AppText, colors, space } from '../lib/theme';
import { Button } from '../components/ui/Button';

// Lets the in-app browser hand the redirect result back to openAuthSessionAsync.
WebBrowser.maybeCompleteAuthSession();

// Google sign-in via Supabase OAuth (PKCE). We ask Supabase for the provider URL
// (skipBrowserRedirect so WE control the browser), open it in the auth session,
// then exchange the returned ?code= for a session. onAuthStateChange in
// SessionProvider picks the session up. Phone-OTP screens stay in the tree,
// dormant. redirectTo resolves to the right thing per environment (an exp:// URL
// in Expo Go, fourty4:// in a dev/standalone build) — register it in Supabase.
export default function SignInScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const redirectTo = Linking.createURL('auth-callback');

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthErr) throw oauthErr;
      if (!data?.url) throw new Error('Could not start Google sign-in.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        setLoading(false); // cancelled / dismissed
        return;
      }

      const { queryParams } = Linking.parse(result.url);
      const code = queryParams?.code;
      if (!code) {
        throw new Error('No auth code returned — check that this redirect URL is registered in Supabase.');
      }
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(String(code));
      if (exErr) throw exErr;

      navigation.goBack();
    } catch (e) {
      setError(e.message ?? 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppText variant="display" style={styles.title}>Welcome to 4forty4</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.subtitle}>Sign in to save spots and build plans.</AppText>

      <Button label="Continue with Google" variant="secondary" loading={loading} onPress={signInWithGoogle} />

      {error ? <AppText variant="label" color={colors.danger} style={styles.error}>{error}</AppText> : null}

      <Button label="Not now" variant="ghost" textColor={colors.textLo} loading={false} onPress={() => navigation.goBack()} style={styles.cancel} />

      {/* Dev aid: the exact redirect URL to register in Supabase Auth. */}
      {__DEV__ ? <AppText variant="caption" color={colors.textMute} style={styles.debug}>redirect: {redirectTo}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.bgBase },
  title: { marginBottom: space.sm },
  subtitle: { marginBottom: space.xxl },
  error: { marginTop: space.base, textAlign: 'center', lineHeight: 20 },
  cancel: { marginTop: space.md },
  debug: { marginTop: space.xl, textAlign: 'center' },
});
