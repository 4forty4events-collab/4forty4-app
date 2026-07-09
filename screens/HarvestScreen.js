import React, { useEffect, useRef, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useMarket } from '../providers/MarketProvider';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

const TICK_INTERVAL_MS = 12000;

// Admin grid-harvester (STAGE A). Sweeps Algiers one sector at a time via the
// resumable harvest-algiers orchestrator. Drives the sweep by polling `tick`.
export default function HarvestScreen({ navigation }) {
  const { market: activeMarket } = useMarket();
  const { height: winHeight } = useWindowDimensions();
  const webHeight = Platform.OS === 'web' ? { height: winHeight } : null;
  const [market, setMarket] = useState(activeMarket === 'ZW' ? 'ZW' : 'DZ');
  const [cap, setCap] = useState('100');
  const [keyword, setKeyword] = useState('restaurants');
  const [zoom, setZoom] = useState('14');
  const [enrich, setEnrich] = useState(false);
  const [harvestMode, setHarvestMode] = useState('breadth');

  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [phase, setPhase] = useState(null);
  const [message, setMessage] = useState(null);
  const [ticking, setTicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const tickRef = useRef(null);
  const tickingRef = useRef(false);

  useEffect(() => () => { tickingRef.current = false; if (tickRef.current) clearTimeout(tickRef.current); }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('harvest_runs').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data && data.status !== 'done') {
        setRunId(data.id);
        setMarket(data.market === 'ZW' ? 'ZW' : 'DZ');
        setCap(String(data.max_venues));
        setKeyword(data.keyword);
        setZoom(String(data.zoom_level));
        applyRun(data);
        setMessage(`Recovered run (${data.status}). ${data.sectors_done}/${data.sectors_total} sectors, ${data.venues_ingested} venues.`);
      }
    })();
  }, []);

  const applyRun = (r) => {
    if (!r) return;
    setRun({
      status: r.status,
      venues_ingested: r.venues_ingested,
      max_venues: r.max_venues,
      sectors_done: r.sectors_done,
      sectors_total: r.sectors_total,
      enrich: r.enrich,
      venues_enriched: r.venues_enriched ?? 0,
      enrich_failed: r.enrich_failed ?? 0,
    });
  };

  const invoke = async (bodyExtra) => {
    const { data, error: fnError } = await supabase.functions.invoke('harvest-algiers', { body: bodyExtra });
    if (fnError) throw fnError;
    if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
    return data;
  };

  const tick = async (id) => {
    if (!tickingRef.current) return;
    try {
      const data = await invoke({ action: 'tick', run_id: id });
      applyRun(data.run);
      setPhase(data.phase);
      setMessage(data.message);
      const status = data.run?.status;
      if (status === 'running') {
        tickRef.current = setTimeout(() => tick(id), TICK_INTERVAL_MS);
      } else {
        tickingRef.current = false;
        setTicking(false);
      }
    } catch (e) {
      tickingRef.current = false;
      setTicking(false);
      setError(e.message ?? 'Tick failed');
    }
  };

  const startLoop = (id) => {
    tickingRef.current = true;
    setTicking(true);
    setError(null);
    tick(id);
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    setMessage('Starting run...');
    try {
      const data = await invoke({
        action: 'start',
        market,
        max_venues: Math.max(parseInt(cap, 10) || 100, 1),
        keyword: keyword.trim() || 'restaurants',
        zoom_level: parseInt(zoom, 10) || 14,
        enrich,
        ...({
          breadth: { breadth: true },
          single: { breadth: false },
          act1: { mode: 'keyword', tier: 1 },
          act2: { mode: 'keyword', tier: 2 },
          food3: { mode: 'keyword', tier: 3 },
        }[harvestMode] ?? { breadth: true }),
      });
      setRunId(data.run.id);
      applyRun(data.run);
      setPhase(data.phase);
      setMessage(data.message);
      setBusy(false);
      startLoop(data.run.id);
    } catch (e) {
      setBusy(false);
      setError(e.message ?? 'Start failed');
      setMessage(null);
    }
  };

  const pause = async () => {
    tickingRef.current = false;
    setTicking(false);
    if (tickRef.current) clearTimeout(tickRef.current);
    setBusy(true);
    try {
      const data = await invoke({ action: 'pause', run_id: runId });
      applyRun(data.run);
      setPhase('paused');
      setMessage('Paused. Resume to continue from the next sector.');
    } catch (e) {
      setError(e.message ?? 'Pause failed');
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await invoke({ action: 'resume', run_id: runId });
      applyRun(data.run);
      setBusy(false);
      startLoop(runId);
    } catch (e) {
      setBusy(false);
      setError(e.message ?? 'Resume failed');
    }
  };

  const raiseAndResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const floor = Math.max(run?.venues_ingested ?? 0, run?.venues_enriched ?? 0) + 1;
      const newCap = Math.max(parseInt(cap, 10) || 100, floor);
      await supabase.from('harvest_runs').update({ max_venues: newCap, status: 'running' }).eq('id', runId);
      const data = await invoke({ action: 'status', run_id: runId });
      applyRun(data.run);
      setBusy(false);
      startLoop(runId);
    } catch (e) {
      setBusy(false);
      setError(e.message ?? 'Could not raise cap');
    }
  };

  const reset = () => {
    tickingRef.current = false;
    setTicking(false);
    if (tickRef.current) clearTimeout(tickRef.current);
    setRunId(null);
    setRun(null);
    setPhase(null);
    setMessage(null);
    setError(null);
  };

  const pct = run && run.sectors_total ? Math.round((run.sectors_done / run.sectors_total) * 100) : 0;
  const capPct = run && run.max_venues ? Math.min(100, Math.round((run.venues_ingested / run.max_venues) * 100)) : 0;
  const isCapped = run?.status === 'capped';
  const isTerminal = run && ['done', 'failed'].includes(run.status);
  const hasRun = !!runId && !!run;

  return (
    <SafeAreaView style={[styles.container, webHeight]} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Button label="‹ Back" variant="ghost" full={false} textColor={colors.textHi} onPress={() => navigation.goBack()} style={styles.backBtn} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppText variant="title" style={styles.title}>Grid harvester — Algiers</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.subtitle}>
          Sweeps Algiers neighborhood-by-neighborhood. Resumable, capped, one sector per step. Discovery runs first; with Enrich on, it then pulls menus + photos for menu-bearing venues (~2 scrapes/venue). Keep your FIRST cap LOW (~50) and watch the Bright Data dashboard before scaling up.
        </AppText>

        {(error || message) ? (
          <View style={[styles.statusBanner, error ? styles.statusError : styles.statusOk]}>
            <AppText variant="label" color={error ? colors.danger : colors.accent2}>{error ? `Error: ${error}` : message}</AppText>
          </View>
        ) : null}

        {!hasRun && (
          <>
            <AppText variant="label" color={colors.textLo} style={styles.label}>Market</AppText>
            <View style={styles.row}>
              {['DZ', 'ZW'].map((m) => (
                <Chip key={m} label={m} selected={market === m} onPress={() => setMarket(m)} />
              ))}
            </View>

            <AppText variant="label" color={colors.textLo} style={styles.label}>Hard venue cap (safety)</AppText>
            <AppText variant="caption" color={colors.textMute} style={styles.hint}>Sweep STOPS at this many new venues. Start low; raise once cost is confirmed.</AppText>
            <TextInput style={styles.input} value={cap} onChangeText={setCap} keyboardType="number-pad" maxLength={5} placeholderTextColor={colors.textMute} />

            <AppText variant="label" color={colors.textLo} style={styles.label}>Harvest mode</AppText>
            <AppText variant="caption" color={colors.textMute} style={styles.hint}>Grid (breadth) = broad category sweep per neighborhood sector. Single = one keyword everywhere. The old keyword tiers are retired.</AppText>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {[['Grid (breadth)', 'breadth'], ['Single', 'single']].map(([lbl, val]) => (
                <Chip key={val} label={lbl} selected={harvestMode === val} onPress={() => setHarvestMode(val)} />
              ))}
            </View>

            {harvestMode === 'single' && (
              <>
                <AppText variant="label" color={colors.textLo} style={styles.label}>Keyword</AppText>
                <AppText variant="caption" color={colors.textMute} style={styles.hint}>Searched in every sector (e.g. "restaurants").</AppText>
                <TextInput style={styles.input} value={keyword} onChangeText={setKeyword} autoCapitalize="none" placeholderTextColor={colors.textMute} />
              </>
            )}

            <AppText variant="label" color={colors.textLo} style={styles.label}>Zoom (sector radius)</AppText>
            <TextInput style={styles.input} value={zoom} onChangeText={setZoom} keyboardType="number-pad" maxLength={2} placeholderTextColor={colors.textMute} />

            <AppText variant="label" color={colors.textLo} style={styles.label}>Enrich (menu + photos)</AppText>
            <AppText variant="caption" color={colors.textMute} style={styles.hint}>After discovery, scrape menus + galleries for restaurants/cafes/hotels/bars. Doubles cost (~2 scrapes/venue).</AppText>
            <View style={styles.row}>
              {[['Discovery only', false], ['Discover + enrich', true]].map(([lbl, val]) => (
                <Chip key={lbl} label={lbl} selected={enrich === val} onPress={() => setEnrich(val)} />
              ))}
            </View>

            <Button label="Start sweep" loading={busy} onPress={start} style={styles.primaryBtn} />
          </>
        )}

        {hasRun && (
          <View style={styles.runBox}>
            <AppText variant="bodySemi" style={styles.runStatus}>{run.status.toUpperCase()}{ticking ? ' - sweeping...' : ''}</AppText>

            <AppText variant="label" color={colors.textLo} style={styles.barLabel}>Sectors: {run.sectors_done}/{run.sectors_total} ({pct}%)</AppText>
            <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>

            <AppText variant="label" color={colors.textLo} style={styles.barLabel}>Venues found: {run.venues_ingested}/{run.max_venues} ({capPct}%)</AppText>
            <View style={styles.barTrack}><View style={[styles.barFill, styles.barFillCap, { width: `${capPct}%` }]} /></View>

            {run.enrich && (
              <AppText variant="label" color={colors.textLo} style={styles.barLabel}>
                Enriched: {run.venues_enriched ?? 0}{run.enrich_failed ? `  (${run.enrich_failed} failed)` : ''}{phase === 'enriching' ? '  - scraping menu...' : ''}
              </AppText>
            )}

            {message && <AppText variant="label" color={colors.textLo} style={styles.message}>{message}</AppText>}

            <View style={styles.btnRow}>
              {ticking && (
                <TouchableOpacity style={[styles.smallBtn, styles.pauseBtn]} onPress={pause} disabled={busy}><AppText variant="label" color="#fff">Pause</AppText></TouchableOpacity>
              )}
              {!ticking && run.status === 'paused' && (
                <TouchableOpacity style={[styles.smallBtn, styles.resumeBtn]} onPress={resume} disabled={busy}><AppText variant="label" color="#fff">Resume</AppText></TouchableOpacity>
              )}
              {!ticking && isCapped && (
                <TouchableOpacity style={[styles.smallBtn, styles.resumeBtn]} onPress={raiseAndResume} disabled={busy}><AppText variant="label" color="#fff">Raise cap + continue</AppText></TouchableOpacity>
              )}
              {!ticking && (
                <TouchableOpacity style={[styles.smallBtn, styles.resetBtn]} onPress={reset} disabled={busy}><AppText variant="label" color={colors.textHi}>{isTerminal ? 'New run' : 'Close'}</AppText></TouchableOpacity>
              )}
              {busy && <ActivityIndicator color={colors.accent} style={{ marginLeft: 8 }} />}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  scroll: { flex: 1 },
  topBar: { paddingHorizontal: space.sm, paddingTop: space.sm },
  backBtn: { alignSelf: 'flex-start', paddingHorizontal: space.sm },
  content: { padding: space.xl, paddingTop: space.sm, paddingBottom: space.huge },
  title: { marginBottom: space.sm },
  subtitle: { marginBottom: space.sm, lineHeight: 20 },
  label: { marginTop: space.base, marginBottom: 6 },
  hint: { marginBottom: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  row: { flexDirection: 'row', gap: space.sm },
  primaryBtn: { marginTop: space.xl },
  statusBanner: { marginTop: space.md, marginBottom: space.xs, padding: space.md, borderRadius: radius.md },
  statusOk: { backgroundColor: 'rgba(79,163,199,0.14)' },
  statusError: { backgroundColor: 'rgba(229,96,94,0.12)' },
  runBox: { marginTop: space.base, padding: space.base, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  runStatus: { marginBottom: space.base, letterSpacing: 0.5 },
  barLabel: { marginBottom: 6 },
  barTrack: { height: 10, borderRadius: 6, backgroundColor: colors.bgElevated2, overflow: 'hidden', marginBottom: space.base },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: colors.accent },
  barFillCap: { backgroundColor: colors.success },
  message: { marginTop: 4, marginBottom: space.base, lineHeight: 19 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  smallBtn: { paddingVertical: 10, paddingHorizontal: space.base, borderRadius: radius.md },
  pauseBtn: { backgroundColor: '#B9770E' },
  resumeBtn: { backgroundColor: '#1e7a46' },
  resetBtn: { backgroundColor: colors.bgElevated2 },
});
