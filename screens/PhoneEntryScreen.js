import { useState } from 'react'
import { View, TextInput, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { AppText, colors, space, radius, fonts } from '../lib/theme'
import { Button } from '../components/ui/Button'
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView'

export default function PhoneEntryScreen({ navigation }) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  // Alert.alert is a no-op on react-native-web, so errors are surfaced as
  // on-screen text instead — otherwise a failed OTP request looks like nothing
  // happened (the sign-in silently stalls) in the browser.
  const [error, setError] = useState(null)

  const sendOtp = async () => {
    setError(null)
    if (!phone || phone.length < 9) {
      setError('Enter your phone number without the country code (e.g. 562196497).')
      return
    }

    const fullPhone = `+213${phone.replace(/^0/, '')}`
    setLoading(true)

    // Native Supabase phone auth. Your test number short-circuits the SMS send.
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: fullPhone })

    setLoading(false)

    if (otpError) {
      setError(otpError.message)
      return
    }

    navigation.navigate('VerifyOtp', { phone: fullPhone })
  }

  return (
    <KeyboardAwareView>
      <View style={styles.container}>
      <AppText variant="display" style={styles.title}>Welcome to 4Forty4</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.subtitle}>Enter your phone number to get started</AppText>

      <View style={styles.inputRow}>
        <AppText variant="bodyMed" style={styles.prefix}>+213</AppText>
        <TextInput
          style={styles.input}
          placeholder="5XX XX XX XX"
          placeholderTextColor={colors.textMute}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          maxLength={10}
        />
      </View>

      <Button label="Send Code" loading={loading} onPress={sendOtp} />

      {error ? <AppText variant="label" color={colors.danger} style={styles.error}>{error}</AppText> : null}
      </View>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.bgBase },
  title: { marginBottom: space.sm },
  subtitle: { marginBottom: space.xxl },
  inputRow: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, marginBottom: space.lg, alignItems: 'center' },
  prefix: { paddingHorizontal: 14, borderRightWidth: 1, borderRightColor: colors.line },
  input: { flex: 1, padding: 14, fontSize: 16, fontFamily: fonts.body, color: colors.textHi },
  error: { marginTop: space.base, textAlign: 'center', lineHeight: 20 },
})
