import { useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../supabase';

WebBrowser.maybeCompleteAuthSession();

// Reusable Google OAuth (PKCE) sign-in. Extracted so the auth gateway and any
// other entry point share one implementation. On success, onAuthStateChange (in
// SessionProvider) picks up the session — callers just re-render. Returns true on
// success, false on cancel; surfaces `error` for display.
export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signIn = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthErr) throw oauthErr;
      if (!data?.url) throw new Error('Could not start Google sign-in.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return false; // cancelled

      const { queryParams } = Linking.parse(result.url);
      const code = queryParams?.code;
      if (!code) throw new Error('No auth code returned — check the redirect URL is registered in Supabase.');

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(String(code));
      if (exErr) throw exErr;
      return true;
    } catch (e) {
      setError(e?.message ?? 'Sign-in failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { signIn, loading, error };
}
