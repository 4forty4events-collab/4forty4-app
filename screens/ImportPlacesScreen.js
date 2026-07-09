import React, { useState } from 'react';
import { View, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useMarket } from '../providers/MarketProvider';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

// Venue categories worth importing from Google (places, not one-off events).
const IMPORTABLE = ['restaurant', 'cafe', 'nightlife', 'hotel', 'tourism', 'outdoor', 'shopping', 'wellness', 'culture'];

export default function ImportPlacesScreen({ navigation }) {
  const { market: activeMarket } = useMarket();
  const [market, setMarket] = useState(activeMarket);
  const [city, setCity] = useState(activeMarket === 'ZW' ? 'Harare' : 'Algiers');
  const [category, setCategory] = useState('restaurant');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!city.trim()) { setError('Enter a city.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('import-places', {
        body: { market, city: city.trim(), category, query: query.trim() || undefined },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
      setResult(data);
    } catch (e) {
      setError(e.message ?? 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Button label="‹ Back" variant="ghost" full={false} textColor={colors.textHi} onPress={() => navigation.goBack()} style={styles.backBtn} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <AppText variant="title" style={styles.title}>Import venues from Google</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.subtitle}>
          Pulls places (restaurants, cafés, hotels) into the feed. Re-running an area won't create duplicates.
        </AppText>

        <AppText variant="label" color={colors.textLo} style={styles.label}>Market</AppText>
        <View style={styles.row}>
          {['DZ', 'ZW'].map((m) => (
            <Chip key={m} label={m} selected={market === m} onPress={() => { setMarket(m); setCity(m === 'ZW' ? 'Harare' : 'Algiers'); }} />
          ))}
        </View>

        <AppText variant="label" color={colors.textLo} style={styles.label}>City</AppText>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="e.g. Algiers" placeholderTextColor={colors.textMute} />

        <AppText variant="label" color={colors.textLo} style={styles.label}>Category</AppText>
        <View style={styles.wrapRow}>
          {IMPORTABLE.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        <AppText variant="label" color={colors.textLo} style={styles.label}>Custom search (optional)</AppText>
        <AppText variant="caption" color={colors.textMute} style={styles.hint}>Overrides category — e.g. "rooftop coffee in Hydra".</AppText>
        <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Leave blank to use the category above" placeholderTextColor={colors.textMute} />

        <Button label="Import" loading={loading} onPress={run} style={styles.importButton} />

        {error && <AppText variant="label" color={colors.danger} style={styles.errorText}>{error}</AppText>}
        {result && (
          <View style={styles.resultBox}>
            <AppText variant="bodySemi" color={colors.success} style={styles.resultText}>{result.message}</AppText>
            <AppText variant="label" color={colors.textLo}>{result.total} found · {result.imported} new · {result.existed} already in catalog</AppText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  topBar: { paddingHorizontal: space.sm, paddingTop: space.sm },
  backBtn: { alignSelf: 'flex-start', paddingHorizontal: space.sm },
  content: { padding: space.xl, paddingTop: space.sm, paddingBottom: space.huge },
  title: { marginBottom: space.sm },
  subtitle: { marginBottom: space.sm, lineHeight: 20 },
  label: { marginTop: space.base, marginBottom: 6 },
  hint: { marginBottom: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  row: { flexDirection: 'row', gap: space.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  importButton: { marginTop: space.xl },
  errorText: { marginTop: space.base, textAlign: 'center' },
  resultBox: { marginTop: space.lg, padding: space.base, borderRadius: radius.md, backgroundColor: 'rgba(79,190,143,0.1)', borderWidth: 1, borderColor: 'rgba(79,190,143,0.35)' },
  resultText: { marginBottom: 4 },
});
