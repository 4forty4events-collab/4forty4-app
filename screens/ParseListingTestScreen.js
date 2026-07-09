import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

const MARKETS = ['DZ', 'ZW'];

export default function ParseListingTestScreen({ navigation }) {
  const [caption, setCaption] = useState('');
  const [market, setMarket] = useState('DZ');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const parse = async () => {
    if (!caption.trim()) return;

    setLoading(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke('parse-listing', {
      body: { text: caption, market },
    });

    setLoading(false);
    setResult(error ? { error: error.message, context: error.context ?? null } : data);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="title" style={styles.title}>Parse Listing — Test</AppText>

      <View style={styles.marketRow}>
        {MARKETS.map((m) => (
          <Chip key={m} label={m} selected={market === m} onPress={() => setMarket(m)} />
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Paste a caption..."
        placeholderTextColor={colors.textMute}
        value={caption}
        onChangeText={setCaption}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />

      <Button label="Parse" loading={loading} onPress={parse} style={styles.button} />

      {result && (
        <View style={styles.resultBox}>
          <AppText style={styles.resultText}>{JSON.stringify(result, null, 2)}</AppText>
        </View>
      )}

      {result?.ok && result.parsed && (
        <Button
          label="Review & Publish"
          onPress={() => navigation.navigate('ReviewListing', { parsed: result.parsed, raw_caption: caption, market })}
          style={styles.reviewButton}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: space.xl },
  title: { marginBottom: space.lg },
  marketRow: { flexDirection: 'row', marginBottom: space.base, gap: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: space.base, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, minHeight: 140, marginBottom: space.lg },
  button: { marginBottom: space.lg },
  resultBox: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.base },
  resultText: { fontFamily: 'monospace', fontSize: 12, color: colors.textLo },
  reviewButton: { marginTop: space.base },
});
