import React, { useCallback, useEffect, useState } from 'react';
import { View, Image, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, Share, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { normalizeVenue, normalizeEvent } from '../lib/feed';
import { composeOuting, saveComposedOuting } from '../lib/plans';
import { slotFor } from '../lib/architect/intents';
import { CATEGORY_COLORS, categoryLabel } from '../lib/categories';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/Button';

function StopRow({ index, item, currency, onPress }) {
  const slot = slotFor(item.category);
  const catColor = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  const km = item.distanceM != null ? `${(item.distanceM / 1000).toFixed(1)} km` : null;
  return (
    <Pressable style={styles.stop} onPress={onPress}>
      <View style={styles.stopIndexCol}>
        <View style={styles.stopDot}><AppText variant="caption" color={colors.onAccent}>{index + 1}</AppText></View>
        <View style={styles.stopLine} />
      </View>
      {item.imageUrl
        ? <Image source={{ uri: item.imageUrl }} style={styles.stopImg} />
        : <View style={[styles.stopImg, { backgroundColor: catColor }]} />}
      <View style={styles.stopBody}>
        <AppText variant="caption" color={colors.accent2}>{slot.emoji} {slot.label.toUpperCase()}</AppText>
        <AppText variant="bodySemi" numberOfLines={1}>{item.title}</AppText>
        <AppText variant="label" color={colors.textLo} numberOfLines={1}>
          {categoryLabel(item.category)}{km ? ` · ${km}` : ''} · ~{item.plannerCost} {currency}
        </AppText>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textMute} />
    </Pressable>
  );
}

// The composed outing — sequenced real stops, budget total, reshuffle / save / share.
// Owns the composition so Reshuffle just recomposes (the meal draw varies each run).
export default function OutingResultScreen({ route, navigation }) {
  const spec = route.params?.spec;
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const compose = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await composeOuting(spec, normalizeVenue, normalizeEvent);
      setResult(r);
    } catch (e) {
      setError(e?.message ?? 'Could not build an outing.');
    } finally {
      setLoading(false);
    }
  }, [spec]);

  useEffect(() => { compose(); }, [compose]);

  const picks = result?.picked ?? [];
  const overBudget = spec ? spec.budget : 0;

  const onSave = async () => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    if (!picks.length) return;
    setSaving(true);
    try {
      await saveComposedOuting(userId, { name: spec.title, budget: spec.budget, currency: spec.currency, market: spec.market, planType: spec.planType }, picks);
      Alert.alert('Saved', 'Your outing is in Outings — budget and tweak it any time.', [
        { text: 'View outings', onPress: () => navigation.navigate('Main', { screen: 'TripsTab' }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      Alert.alert('Could not save', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const onShare = () => {
    if (!picks.length) return;
    const lines = picks.map((p, i) => `${i + 1}. ${p.title}`).join('\n');
    Share.share({ message: `${spec.title} on 4forty4:\n${lines}\n~${result.spent} ${spec.currency} · found on 4forty4` }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading" numberOfLines={1} style={styles.topTitle}>{spec?.title ?? 'Your outing'}</AppText>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <AppText variant="body" color={colors.textLo}>Designing your outing…</AppText>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error}</AppText>
          <Button label="Try again" variant="secondary" full={false} onPress={compose} />
        </View>
      ) : picks.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="title" style={styles.centerText}>Nothing fits yet</AppText>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>
            The priced catalog is still filling in for this. Try a higher budget, “Surprise me”, or turn off Near me.
          </AppText>
          <Button label="Adjust" variant="secondary" full={false} onPress={() => navigation.goBack()} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.summary}>
              <AppText variant="bodySemi" color={colors.textHi}>
                {picks.length} stop{picks.length === 1 ? '' : 's'} · ~{result.spent} of {overBudget} {spec.currency}
              </AppText>
              <AppText variant="label" color={colors.textLo}>
                {result.typeCount >= 2 ? 'A varied day — a bite, something to do, and more.' : 'A focused pick for now — more variety fills in as the catalog grows.'}
              </AppText>
            </View>

            {picks.map((item, i) => (
              <StopRow key={`${item.kind}-${item.id}`} index={i} item={item} currency={spec.currency} onPress={() => navigation.navigate('ListingDetail', { item })} />
            ))}

            <AppText variant="caption" color={colors.textMute} style={styles.foot}>Real places from your local catalog. Prices are per-person estimates.</AppText>
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Reshuffle" icon="🎲" variant="secondary" onPress={compose} style={styles.actionBtn} />
            <Button label={saving ? 'Saving…' : 'Save'} onPress={onSave} loading={saving} style={styles.actionBtn} />
          </View>
          <TouchableOpacity style={styles.shareRow} onPress={onShare} hitSlop={8}>
            <Icon name="share" size={16} color={colors.textLo} />
            <AppText variant="label" color={colors.textLo}>Share this outing</AppText>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs, gap: space.sm },
  topTitle: { flex: 1, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  body: { padding: space.base, paddingBottom: space.lg },
  summary: { marginBottom: space.md, gap: 2 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  stopIndexCol: { alignItems: 'center', width: 22 },
  stopDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stopLine: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginTop: 2, minHeight: 12 },
  stopImg: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  stopBody: { flex: 1, gap: 2 },
  foot: { marginTop: space.md, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.base, paddingTop: space.sm },
  actionBtn: { flex: 1 },
  shareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md },
});
