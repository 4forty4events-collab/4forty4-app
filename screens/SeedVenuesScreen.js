import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { supabase } from '../lib/supabase';
import { useMarket } from '../providers/MarketProvider';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

const CATEGORIES = ['restaurant', 'cafe', 'nightlife', 'hotel', 'tourism', 'outdoor', 'shopping', 'wellness', 'culture'];

const DEFAULTS = {
  DZ: { city: 'Algiers', lat: '36.7449', long: '3.0392', keyword: 'restaurants' },
  ZW: { city: 'Harare', lat: '-17.8047', long: '31.0353', keyword: 'restaurants' },
};

const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 24;

// Admin seed tool — Bright Data "Discover by location" (coordinates + keyword) →
// live venues. Async scrape (~2 min): first tap triggers, screen auto-polls.
export default function SeedVenuesScreen({ navigation }) {
  const { market: activeMarket } = useMarket();
  const seed0 = DEFAULTS[activeMarket] ?? DEFAULTS.DZ;
  const [market, setMarket] = useState(activeMarket);
  const [city, setCity] = useState(seed0.city);
  const [lat, setLat] = useState(seed0.lat);
  const [long, setLong] = useState(seed0.long);
  const [zoom, setZoom] = useState('15');
  const [keyword, setKeyword] = useState(seed0.keyword);
  const [category, setCategory] = useState('restaurant');
  const [count, setCount] = useState('50');

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState(null);
  const [pendingSnapshot, setPendingSnapshot] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const pollRef = useRef(null);
  const pollsRef = useRef(0);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const ingestBody = (extra) => ({ market, city: city.trim() || undefined, category, ...extra });

  const poll = async (snapshotId) => {
    pollsRef.current += 1;
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ingest-brightdata', {
        body: ingestBody({ snapshot_id: snapshotId }),
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);

      if (data?.pending) {
        if (pollsRef.current >= MAX_POLLS) {
          setLoading(false);
          setPendingSnapshot(snapshotId);
          setStatusText('Taking longer than expected. Tap "Check status" to keep waiting.');
          return;
        }
        setStatusText(`Still scraping… (check ${pollsRef.current})`);
        pollRef.current = setTimeout(() => poll(snapshotId), POLL_INTERVAL_MS);
      } else {
        setLoading(false);
        setPendingSnapshot(null);
        setStatusText(null);
        setResult(data);
      }
    } catch (e) {
      setLoading(false);
      setPendingSnapshot(snapshotId);
      setError(e.message ?? 'Polling failed');
    }
  };

  const seed = async () => {
    if (!keyword.trim()) { setError('Enter a keyword, e.g. "restaurants" or "cafes".'); return; }
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(long))) { setError('Latitude and longitude must be numbers.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    setPendingSnapshot(null);
    setStatusText('Starting scrape…');
    pollsRef.current = 0;
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ingest-brightdata', {
        body: ingestBody({
          keyword: keyword.trim(),
          lat: Number(lat),
          long: Number(long),
          zoom_level: Number(zoom) || 15,
          count: Math.min(Math.max(parseInt(count, 10) || 50, 1), 500),
        }),
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);

      if (data?.pending && data.snapshot_id) {
        setStatusText('Scraping (~2 min)… polling automatically.');
        pollRef.current = setTimeout(() => poll(data.snapshot_id), POLL_INTERVAL_MS);
      } else {
        setLoading(false);
        setResult(data);
        setStatusText(null);
      }
    } catch (e) {
      setLoading(false);
      setStatusText(null);
      setError(e.message ?? 'Seed failed');
    }
  };

  const resume = () => {
    if (!pendingSnapshot) return;
    setLoading(true);
    setError(null);
    pollsRef.current = 0;
    setStatusText('Checking…');
    poll(pendingSnapshot);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView>
      <View style={styles.topBar}>
        <Button label="‹ Back" variant="ghost" full={false} textColor={colors.textHi} onPress={() => navigation.goBack()} style={styles.backBtn} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="title" style={styles.title}>Seed venues (Bright Data)</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.subtitle}>
          "Discover by location" — searches coordinates + keyword. Small live-test batch. Covers re-host to R2; re-running won't duplicate. The scrape takes ~2 min; polling is automatic.
        </AppText>

        <AppText variant="label" color={colors.textLo} style={styles.label}>Market</AppText>
        <View style={styles.row}>
          {['DZ', 'ZW'].map((m) => (
            <Chip key={m} label={m} selected={market === m} onPress={() => {
              setMarket(m);
              const d = DEFAULTS[m];
              setCity(d.city); setLat(d.lat); setLong(d.long); setKeyword(d.keyword);
            }} />
          ))}
        </View>

        <AppText variant="label" color={colors.textLo} style={styles.label}>City (stored on each venue)</AppText>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="e.g. Algiers" placeholderTextColor={colors.textMute} />

        <AppText variant="label" color={colors.textLo} style={styles.label}>Keyword</AppText>
        <AppText variant="caption" color={colors.textMute} style={styles.hint}>Category or term to search, e.g. "restaurants", "cafes". Not an address.</AppText>
        <TextInput style={styles.input} value={keyword} onChangeText={setKeyword} autoCapitalize="none" placeholderTextColor={colors.textMute} />

        <AppText variant="label" color={colors.textLo} style={styles.label}>Neighborhood coordinates</AppText>
        <AppText variant="caption" color={colors.textMute} style={styles.hint}>Default = Hydra, Algiers. Change to seed another area.</AppText>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} value={lat} onChangeText={setLat} placeholder="lat" placeholderTextColor={colors.textMute} keyboardType="numbers-and-punctuation" />
          <TextInput style={[styles.input, styles.half]} value={long} onChangeText={setLong} placeholder="long" placeholderTextColor={colors.textMute} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <AppText variant="caption" color={colors.textMute} style={styles.miniLabel}>Zoom (radius)</AppText>
            <TextInput style={styles.input} value={zoom} onChangeText={setZoom} keyboardType="number-pad" maxLength={2} />
          </View>
          <View style={styles.half}>
            <AppText variant="caption" color={colors.textMute} style={styles.miniLabel}>How many (per point)</AppText>
            <TextInput style={styles.input} value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={4} />
          </View>
        </View>

        <AppText variant="label" color={colors.textLo} style={styles.label}>Category (fallback tag for the batch)</AppText>
        <View style={styles.wrapRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        {pendingSnapshot && !loading ? (
          <Button label="Check status" onPress={resume} style={styles.seedButton} />
        ) : (
          <Button label="Seed venues" loading={loading} onPress={seed} style={styles.seedButton} />
        )}

        {statusText && <AppText variant="label" color={colors.textLo} style={styles.workingText}>{statusText}</AppText>}
        {error && <AppText variant="label" color={colors.danger} style={styles.errorText}>{error}</AppText>}
        {result && (
          <View style={styles.resultBox}>
            <AppText variant="bodySemi" color={colors.success} style={styles.resultText}>{result.message}</AppText>
            <AppText variant="label" color={colors.textLo}>{result.total} found · {result.imported} new · {result.existed} refreshed · {result.images} covers to R2</AppText>
            {result.area_multiplier != null ? <AppText variant="label" color={colors.textLo}>Area pricing multiplier: ×{result.area_multiplier}</AppText> : null}
            <AppText variant="label" color={colors.textLo}>Galleries + menus come from Enrich on each Detail screen.</AppText>
            {result.photo_structure ? <AppText variant="label" color={colors.textLo}>Structure: {result.photo_structure}</AppText> : null}
          </View>
        )}
      </ScrollView>
      </KeyboardAwareView>
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
  miniLabel: { marginBottom: 4 },
  hint: { marginBottom: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  half: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  seedButton: { marginTop: space.xl },
  workingText: { marginTop: space.md, textAlign: 'center' },
  errorText: { marginTop: space.base, textAlign: 'center' },
  resultBox: { marginTop: space.lg, padding: space.base, borderRadius: radius.md, backgroundColor: 'rgba(79,190,143,0.1)', borderWidth: 1, borderColor: 'rgba(79,190,143,0.35)' },
  resultText: { marginBottom: 4 },
});
