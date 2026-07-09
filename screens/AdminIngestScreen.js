import React, { useState } from 'react';
import {
  View, TextInput, ScrollView, TouchableOpacity, Alert, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useAdminIngest } from '../lib/coordination/hooks';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';

// Admin "Paste a Reel": manually feed a social post into the external_itineraries
// RAG source (routes to the is_admin()-gated admin_ingest_external_itinerary RPC).
export default function AdminIngestScreen({ navigation }) {
  const { market } = useMarket();
  const [url, setUrl] = useState('');
  const [handle, setHandle] = useState('');
  const [loc, setLoc] = useState('');
  const [caption, setCaption] = useState('');
  const [lastId, setLastId] = useState(null);
  const ingest = useAdminIngest();

  const submit = () => {
    if (!caption.trim()) return;
    ingest.mutate(
      { market, body: caption, handle, url, locationText: loc },
      {
        onSuccess: (id) => {
          setLastId(id);
          setUrl(''); setHandle(''); setLoc(''); setCaption('');
          Alert.alert('Ingested', 'Post added to the social RAG source.');
        },
        onError: (e) => Alert.alert('Error', String(e.message ?? e)),
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
          <AppText variant="heading">Ingest Reel · {market}</AppText>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="label" color={colors.textLo} style={styles.intro}>Paste a viral local post. Hashtags become tags automatically; the caption feeds the curator's social intelligence.</AppText>

          <AppText variant="label" color={colors.textLo} style={styles.label}>Instagram URL</AppText>
          <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="https://instagram.com/p/…" placeholderTextColor={colors.textMute} autoCapitalize="none" keyboardType="url" />

          <AppText variant="label" color={colors.textLo} style={styles.label}>Handle</AppText>
          <TextInput style={styles.input} value={handle} onChangeText={setHandle} placeholder="@account" placeholderTextColor={colors.textMute} autoCapitalize="none" />

          <AppText variant="label" color={colors.textLo} style={styles.label}>Location text</AppText>
          <TextInput style={styles.input} value={loc} onChangeText={setLoc} placeholder="El Achour, Algiers" placeholderTextColor={colors.textMute} />

          <AppText variant="label" color={colors.textLo} style={styles.label}>Caption</AppText>
          <TextInput style={[styles.input, styles.caption]} value={caption} onChangeText={setCaption} placeholder="Paste the full caption incl. #hashtags…" placeholderTextColor={colors.textMute} multiline maxLength={2000} />

          {lastId ? <AppText variant="label" color={colors.success} style={styles.ok}>✓ Last ingested: {lastId.slice(0, 8)}</AppText> : null}
          <View style={{ height: space.lg }} />
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Ingest post" variant="primary" textColor="#fff" loading={ingest.isPending} disabled={!caption.trim()} onPress={submit} style={styles.submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  content: { padding: space.lg },
  intro: { lineHeight: 19, marginBottom: space.md },
  label: { marginTop: space.base, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  caption: { minHeight: 120, textAlignVertical: 'top' },
  ok: { marginTop: space.base },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  submit: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
});
