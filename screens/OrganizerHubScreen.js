import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useMyOrganizers, useMyVenues, useMyEvents, useDeleteEvent } from '../lib/organizer/hooks';
import { EventComposer } from '../components/organizer/EventComposer';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';

const VERIF = {
  verified: ['verified', colors.success, 'rgba(79,190,143,0.14)'],
  pending: ['pending', colors.star, 'rgba(240,181,74,0.14)'],
  rejected: ['rejected', colors.danger, 'rgba(229,96,94,0.12)'],
  unverified: ['unverified', colors.textLo, colors.bgElevated2],
};

export default function OrganizerHubScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;

  const { data: organizers, isLoading } = useMyOrganizers(userId);
  const organizer = organizers?.[0] ?? null;
  const { data: venues = [] } = useMyVenues(organizer?.id);
  const { data: events = [] } = useMyEvents(organizer?.id);
  const deleteEvent = useDeleteEvent(organizer?.id);
  const [composer, setComposer] = useState({ open: false, existing: null });

  const TopBar = (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
      <AppText variant="heading">{t('organizer.portal')}</AppText>
      <View style={{ width: 24 }} />
    </View>
  );

  if (!userId) {
    return <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}><AppText variant="body" color={colors.textLo}>{t('community.signInToReview')}</AppText></SafeAreaView>;
  }
  if (isLoading) {
    return <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>{TopBar}<ActivityIndicator size="large" color={colors.accent} /></SafeAreaView>;
  }

  // Onboarding — no organizer yet.
  if (!organizer) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {TopBar}
        <View style={styles.onboard}>
          <AppText style={styles.onboardEmoji}>🏪</AppText>
          <AppText variant="title" style={styles.centerText}>{t('organizer.onboardTitle')}</AppText>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>{t('organizer.onboardBody')}</AppText>
          <Button label={t('organizer.create')} full={false} onPress={() => navigation.navigate('OrganizerProfileEditor', {})} />
        </View>
      </SafeAreaView>
    );
  }

  const [vLabel, vColor, vBg] = VERIF[organizer.verificationStatus] ?? VERIF.unverified;

  const confirmDelete = (ev) => Alert.alert(t('organizer.delete'), ev.title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('organizer.delete'), style: 'destructive', onPress: () => deleteEvent.mutate(ev.id) },
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {TopBar}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Profile card */}
        <View style={styles.orgCard}>
          {organizer.logoUrl ? <Image source={{ uri: organizer.logoUrl }} style={styles.logo} /> : <View style={[styles.logo, styles.logoFallback]}><AppText color={colors.onAccent} style={styles.logoInitial}>{(organizer.name[0] ?? '?').toUpperCase()}</AppText></View>}
          <View style={{ flex: 1 }}>
            <AppText variant="heading" numberOfLines={1}>{organizer.name}</AppText>
            <View style={[styles.badge, { backgroundColor: vBg }]}><AppText variant="caption" color={vColor}>{t(`organizer.${vLabel}`)}</AppText></View>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('OrganizerProfileEditor', { organizer })}>
            <AppText variant="label" color={colors.textHi}>{t('organizer.save').split(' ')[0]}</AppText>
          </TouchableOpacity>
        </View>

        {/* Venues -> analytics */}
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('organizer.myVenues')}</AppText>
        {venues.length === 0 ? <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('organizer.noVenues')}</AppText> : venues.map((v) => (
          <TouchableOpacity key={v.id} style={styles.row} onPress={() => navigation.navigate('ListingAnalytics', { kind: 'venue', id: v.id, title: v.title })}>
            <AppText variant="bodySemi" numberOfLines={1} style={styles.rowTitle}>{v.title}</AppText>
            <AppText variant="caption" color={colors.accent2}>{t('organizer.analytics')} ›</AppText>
          </TouchableOpacity>
        ))}

        {/* Events management */}
        <View style={styles.sectionHead}>
          <AppText variant="caption" color={colors.textMute}>{t('organizer.myEvents')}</AppText>
          <TouchableOpacity onPress={() => setComposer({ open: true, existing: null })}><AppText variant="label" color={colors.accent2}>＋ {t('organizer.newEvent')}</AppText></TouchableOpacity>
        </View>
        {events.length === 0 ? <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('organizer.noEvents')}</AppText> : events.map((e) => (
          <View key={e.id} style={styles.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setComposer({ open: true, existing: e })}>
              <AppText variant="bodySemi" numberOfLines={1}>{e.title}</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ListingAnalytics', { kind: 'event', id: e.id, title: e.title })}><AppText variant="caption" color={colors.accent2}>{t('organizer.analytics')}</AppText></TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(e)} style={{ marginLeft: space.sm }}><AppText color={colors.danger} style={styles.deleteX}>✕</AppText></TouchableOpacity>
          </View>
        ))}

        <View style={{ height: space.xxl }} />
      </ScrollView>

      <EventComposer
        visible={composer.open}
        onClose={() => setComposer({ open: false, existing: null })}
        userId={userId}
        organizerId={organizer.id}
        market={market}
        venues={venues}
        existing={composer.existing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  content: { padding: space.base },
  onboard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, gap: space.md },
  onboardEmoji: { fontSize: 44, marginBottom: 6 },
  orgCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base },
  logo: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  logoInitial: { fontSize: 22, fontFamily: 'Fraunces_700Bold' },
  badge: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8, marginTop: 5 },
  editBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: space.md },
  sectionLabel: { marginTop: space.xl, marginBottom: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { flex: 1 },
  deleteX: { fontSize: 15 },
  empty: { paddingVertical: 6 },
});
