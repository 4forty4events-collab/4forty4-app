import React, { useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useTripItinerary, useCloneTrip } from '../lib/coordination/hooks';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';

function groupByDay(items) {
  const map = new Map();
  items.forEach((it) => { const k = it.dayDate ?? '—'; if (!map.has(k)) map.set(k, []); map.get(k).push(it); });
  return Array.from(map.entries());
}

// Read-only preview of a public trip blueprint + a Clone action that copies its
// itinerary into a fresh personal trip.
export default function BlueprintPreviewScreen({ route, navigation }) {
  const { tripId, title } = route.params;
  const { session } = useSession();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;
  const { data: itin, isLoading } = useTripItinerary(tripId);
  const clone = useCloneTrip(userId);
  const days = useMemo(() => groupByDay(itin?.items ?? []), [itin]);

  const onClone = () => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    clone.mutate(tripId, {
      onSuccess: (trip) => { Alert.alert(t('coordination.cloned')); navigation.replace('TripWorkspace', { tripId: trip.id, title: trip.title, myRole: 'owner' }); },
      onError: (e) => Alert.alert('Error', String(e.message ?? e)),
    });
  };
  const openDetail = (kind, id) => { if (kind && id) navigation.navigate('ListingDetail', { id, kind }); };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
        <AppText variant="heading" numberOfLines={1} style={styles.topTitle}>{t('coordination.blueprint')}</AppText>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.base, paddingBottom: 100 }}>
          <AppText variant="title" style={styles.title}>{title ?? itin?.trip?.title}</AppText>
          {days.length === 0 ? (
            <AppText variant="body" color={colors.textLo}>{t('coordination.noItems')}</AppText>
          ) : days.map(([day, items]) => (
            <View key={day} style={styles.daySection}>
              <AppText variant="heading" color={colors.accent2} style={styles.dayLabel}>{day === '—' ? t('coordination.itinerary') : day}</AppText>
              {items.map((it) => (
                <TouchableOpacity key={it.id} style={styles.item} onPress={() => openDetail(it.kind, it.targetId)} activeOpacity={0.7}>
                  <View style={styles.itemDot} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySemi" numberOfLines={1}>{it.title ?? it.kind}</AppText>
                    {it.note ? <AppText variant="label" color={colors.textLo} style={styles.itemNote}>{it.note}</AppText> : null}
                  </View>
                  <AppText style={styles.chevron} color={colors.textMute}>›</AppText>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Button label={`💬 ${t('coordination.openRoom')}`} variant="secondary" onPress={() => navigation.navigate('TripWorkspace', { tripId, title: title ?? itin?.trip?.title })} style={styles.footerBtn} />
        <Button label={`⧉ ${t('coordination.cloneItinerary')}`} loading={clone.isPending} onPress={onClone} style={styles.footerBtn} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  topTitle: { flex: 1, textAlign: 'center' },
  title: { marginBottom: space.base },
  daySection: { marginBottom: space.lg },
  dayLabel: { marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  itemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  itemNote: { marginTop: 2 },
  chevron: { fontSize: 20 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: space.sm, padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bgBase },
  footerBtn: { flex: 1 },
});
