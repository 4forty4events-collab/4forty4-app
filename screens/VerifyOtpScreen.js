import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';

export default function VerifyOtpScreen({ route, navigation }) {
  const { phone } = route.params || { phone: '' };
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  // Same reason as PhoneEntry: Alert is a no-op on web, so show errors inline.
  const [error, setError] = useState(null);

  const verify = async () => {
    setError(null);
    if (code.length !== 6) {
      setError('Enter the 6-digit code sent to your phone.');
      return;
    }

    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    // Pop exactly the two auth screens (PhoneEntry + VerifyOtp), landing back on
    // whatever launched sign-in — the tabs from a header button, or the Detail
    // screen mid guest-save so the save can complete on return.
    navigation.pop(2);
  };

  return (
    <KeyboardAwareView>
      <View style={styles.container}>
      <AppText variant="title" style={styles.title}>Enter verification code</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.subtitle}>We sent a code to {phone}</AppText>

      <TextInput
        style={styles.input}
        placeholder="123456"
        placeholderTextColor={colors.textMute}
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
        maxLength={6}
      />

      <Button label="Verify" loading={loading} onPress={verify} />

      {error ? <AppText variant="label" color={colors.danger} style={styles.error}>{error}</AppText> : null}
      </View>
    </KeyboardAwareView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.bgBase },
  title: { marginBottom: space.sm },
  subtitle: { marginBottom: space.xxl },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 16, fontSize: 24, fontFamily: fonts.body, color: colors.textHi, textAlign: 'center', letterSpacing: 8, marginBottom: space.lg },
  error: { marginTop: space.base, textAlign: 'center', lineHeight: 20 },
});
