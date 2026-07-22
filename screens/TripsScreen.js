import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useMyTrips, useOutingEnrichment } from '../lib/coordination/hooks';
import { fetchPlans } from '../lib/plans';
import { CreateTripModal } from '../components/coordination/CreateTripModal';
import { Avatar } from '../components/social/PostCard';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

// Cover fallback (no stop photo yet) + the AI planner card use the brand gradient.
const COVER_FALLBACK = ['#3A2350', '#7A2A57', '#B8532E'];
const AI_GRADIENT = ['#3B1E63', '#5A1E5E', '#241238'];
const SCRIM = ['rgba(8,12,20,0)', 'rgba(8,12,20,0.35)', 'rgba(8,12,20,0.92)'];

const BADGE_TONE = {
  today: { backgroundColor: colors.accent, color: colors.onAccent },
  soon: { backgroundColor: 'rgba(79,163,199,0.9)', color: '#fff' },
  upcoming: { backgroundColor: 'rgba(255,255,255,0.16)', color: '#fff' },
  muted: { backgroundColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' },
};

const EMOJI_RULES = [
  [/birthday|cake/i, '🎂'], [/beach|ocean|sea|coast/i, '🏖️'], [/girls?|ladies|brunch/i, '✨'],
  [/dinner|lunch|food|eat|feast/i, '🍽️'], [/trip|mountain|hike|nature|adventure/i, '⛰️'],
  [/party|club|night/i, '🎉'], [/coffee|cafe|café/i, '☕'], [/date|romantic|anniversary/i, '💕'],
];
function emojiFor(title) {
  for (const [re, e] of EMOJI_RULES) if (re.test(title || '')) return e;
  return '✨';
}

function toYMD(d) { return d.toLocaleDateString('en-CA'); }

// "TODAY" for an outing happening now, "TOMORROW", a weekday name within the week,
// "UPCOMING" beyond that, "MEMORIES" once it's past. (Tonight/Cancelled need a time +
// status field the schema doesn't carry yet — a later pass.)
function outingBadge(startDate, endDate, isPast) {
  if (isPast) return { label: 'MEMORIES', tone: 'muted' };
  if (!startDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(`${startDate}T00:00:00`);
  const days = Math.round((start - today) / 86400000);
  const ongoing = days <= 0 && (!endDate || endDate >= toYMD(today));
  if (ongoing) return { label: 'TODAY', tone: 'today' };
  if (days === 1) return { label: 'TOMORROW', tone: 'soon' };
  if (days >= 2 && days <= 6) return { label: start.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase(), tone: 'soon' };
  return { label: 'UPCOMING', tone: 'upcoming' };
}

function fmtDate(ymd) {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function AvatarStack({ members, extra }) {
  return (
    <View style={styles.stack}>
      {members.map((m, i) => (
        <View key={m.id ?? i} style={[styles.stackItem, i > 0 && { marginLeft: -10 }]}>
          <Avatar url={m.avatarUrl} name={m.name} size={26} />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.stackItem, styles.stackMore, { marginLeft: -10 }]}>
          <AppText variant="caption" color="#fff">+{extra}</AppText>
        </View>
      ) : null}
    </View>
  );
}

function OutingCard({ card, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      {card.cover
        ? <ExpoImage source={{ uri: card.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        : <LinearGradient colors={COVER_FALLBACK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={SCRIM} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={styles.badgeRow} pointerEvents="none">
        {card.badge ? (
          <View style={[styles.badge, { backgroundColor: BADGE_TONE[card.badge.tone].backgroundColor }]}>
            <AppText variant="caption" color={BADGE_TONE[card.badge.tone].color}>{card.badge.label}</AppText>
          </View>
        ) : <View />}
        {card.isBlueprint ? (
          <View style={styles.blueprint}><AppText variant="caption" color="#fff">◎ Blueprint</AppText></View>
        ) : null}
      </View>
      {!card.cover ? <AppText style={styles.coverEmoji} pointerEvents="none">{card.emoji}</AppText> : null}

      <View style={styles.cardBody}>
        <AppText variant="heading" color="#fff" numberOfLines={1} style={styles.cardTitle}>{card.title}  {card.emoji}</AppText>
        <AppText variant="label" color="rgba(255,255,255,0.9)" numberOfLines={1} style={styles.meta}>{card.meta}</AppText>

        {card.budget ? (
          <View style={styles.progWrap}>
            <View style={styles.progTrack}>
              <View style={[styles.progFill, { width: `${card.progress}%` }, card.over && styles.progOver]} />
            </View>
            <AppText variant="caption" color="rgba(255,255,255,0.9)">{card.progress}%</AppText>
          </View>
        ) : card.members?.length ? (
          <View style={styles.bottomRow}>
            <AvatarStack members={card.members} extra={card.memberCount - card.members.length} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// Outings — the single home for everything you've planned: AI/manual budget outings
// AND collaborative trips, redesigned as rich, today-aware experience cards.
export default function TripsScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id ?? null;
  const { data: trips = [], isLoading: tripsLoading } = useMyTrips(userId);
  const { data: plans = [], isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ['plans', userId ?? null],
    queryFn: () => fetchPlans(userId),
    enabled: !!userId,
  });
  useFocusEffect(useCallback(() => { if (userId) refetchPlans(); }, [userId, refetchPlans]));
  const [createOpen, setCreateOpen] = useState(false);

  const { tripsMap, plansMap } = useOutingEnrichment(trips.map((tr) => tr.id), plans.map((p) => p.id));

  const openTrip = (tr) => navigation.navigate('TripWorkspace', { tripId: tr.id, title: tr.title, myRole: tr.myRole });

  const todayStr = new Date().toLocaleDateString('en-CA');
  const isPastTrip = (tr) => { const last = tr.endDate || tr.startDate; return !!last && last < todayStr; };

  // Merge both kinds into one normalized card model. Active first, soonest/newest first.
  const cards = useMemo(() => {
    const tripCards = trips.map((tr) => {
      const e = tripsMap[tr.id] ?? {};
      const past = isPastTrip(tr);
      const bits = [fmtDate(tr.startDate), e.memberCount ? `${e.memberCount} friend${e.memberCount === 1 ? '' : 's'}` : null, e.placeCount ? `${e.placeCount} place${e.placeCount === 1 ? '' : 's'}` : null].filter(Boolean);
      return {
        key: `trip-${tr.id}`, kind: 'trip', past, sortKey: tr.startDate || tr.createdAt || '',
        title: tr.title, emoji: emojiFor(tr.title), cover: e.cover ?? null,
        badge: outingBadge(tr.startDate, tr.endDate, past), isBlueprint: !!tr.isPublic,
        meta: bits.join('  ·  ') || 'Tap to open', members: e.members ?? [], memberCount: e.memberCount ?? 0,
        onPress: () => openTrip(tr),
      };
    });
    const planCards = plans.map((p) => {
      const e = plansMap[p.id] ?? {};
      const budget = Number(p.total_budget) || 0;
      const progress = budget > 0 ? Math.min(100, Math.round((Number(p.spent) || 0) / budget * 100)) : 0;
      return {
        key: `plan-${p.id}`, kind: 'plan', past: false, sortKey: p.created_at || '',
        title: p.name || 'Outing plan', emoji: emojiFor(p.name), cover: e.cover ?? null,
        badge: null, isBlueprint: false,
        meta: `${p.itemCount} stop${p.itemCount === 1 ? '' : 's'}  ·  ${p.spent} / ${budget} ${p.currency}`,
        budget, progress, over: (Number(p.spent) || 0) > budget,
        onPress: () => navigation.navigate('PlanDetail', { planId: p.id }),
      };
    });
    return [...tripCards, ...planCards].sort((a, b) => {
      if (a.past !== b.past) return a.past ? 1 : -1;
      return String(b.sortKey).localeCompare(String(a.sortKey));
    });
  }, [trips, plans, tripsMap, plansMap]);

  const activeCards = cards.filter((c) => !c.past);
  const pastCards = cards.filter((c) => c.past);
  const isLoading = tripsLoading || plansLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="display" style={styles.hTitle}>Outings</AppText>
          <AppText variant="label" color={colors.textLo}>Every plan. Every memory.</AppText>
        </View>
        {userId ? (
          <TouchableOpacity style={styles.newBtn} onPress={() => setCreateOpen(true)} activeOpacity={0.85}>
            <Icon name="plus" size={16} color={colors.onAccent} />
            <AppText variant="label" color={colors.onAccent}>New outing</AppText>
          </TouchableOpacity>
        ) : null}
      </View>

      {!userId ? (
        <View style={styles.center}><AppText variant="body" color={colors.textLo}>{t('community.signInToReview')}</AppText></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} showsVerticalScrollIndicator={false}>
          {/* AI Planner — the magical entry into the outing architect. */}
          <TouchableOpacity style={styles.aiCard} onPress={() => navigation.navigate('Architect')} activeOpacity={0.9}>
            <LinearGradient colors={AI_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.aiGlow} pointerEvents="none" />
            <View style={styles.aiSpark}><Icon name="spark" size={22} color="#fff" fill /></View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" color="#fff">AI Planner</AppText>
              <AppText variant="label" color="rgba(255,255,255,0.78)" style={styles.aiSub}>Tell me your vibe. I’ll build the perfect day.</AppText>
            </View>
            <Icon name="chevronRight" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
          ) : cards.length === 0 ? (
            <View style={styles.center}><AppText variant="body" color={colors.textLo} style={styles.emptyText}>{t('coordination.noTrips')}</AppText></View>
          ) : (
            <>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionHeader}>YOUR OUTINGS</AppText>
              {activeCards.map((c) => <OutingCard key={c.key} card={c} onPress={c.onPress} />)}

              {pastCards.length > 0 ? (
                <>
                  <AppText variant="caption" color={colors.textMute} style={styles.sectionHeader}>MEMORIES</AppText>
                  {pastCards.map((c) => <View key={c.key} style={styles.pastWrap}><OutingCard card={c} onPress={c.onPress} /></View>)}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      )}

      <CreateTripModal visible={createOpen} onClose={() => setCreateOpen(false)} userId={userId} market={market} onCreated={openTrip} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: 60 },
  emptyText: { textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.base },
  hTitle: { marginBottom: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14 },
  content: { paddingHorizontal: space.base },

  aiCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.xl, overflow: 'hidden', padding: space.base, minHeight: 96, borderWidth: 1, borderColor: 'rgba(180,120,255,0.35)' },
  aiGlow: { position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(180,80,220,0.35)' },
  aiSpark: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  aiSub: { marginTop: 3, lineHeight: 18 },

  sectionHeader: { marginTop: space.xl, marginBottom: space.sm },
  pastWrap: { opacity: 0.7 },

  card: { height: 168, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated2, marginBottom: space.md, justifyContent: 'flex-end' },
  badgeRow: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 9 },
  blueprint: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(11,18,32,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 9 },
  coverEmoji: { position: 'absolute', top: space.lg, right: space.base, fontSize: 40, opacity: 0.9 },
  cardBody: { padding: space.base, gap: 5 },
  cardTitle: { fontSize: 20 },
  meta: {},
  progWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  progTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  progOver: { backgroundColor: colors.danger },
  bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderWidth: 2, borderColor: 'rgba(11,18,32,0.9)', borderRadius: 15 },
  stackMore: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated2, alignItems: 'center', justifyContent: 'center' },
});
