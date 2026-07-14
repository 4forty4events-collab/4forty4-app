import React, { useEffect, useMemo, useState } from 'react';
import {
  View, TextInput, ScrollView, TouchableOpacity, Image, ActivityIndicator, Share, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { CATEGORIES, CATEGORY_COLORS } from '../lib/categories';
import { AuthGateway } from '../components/auth/AuthGateway';
import { CreatorStats } from '../components/community/CreatorStats';
import { RequestPlaceModal } from '../components/coordination/RequestPlaceModal';
import { RadarUpsellModal } from '../components/radar/RadarUpsellModal';
import { RadarShowcaseCard } from '../components/radar/RadarShowcaseCard';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useProfile, useUpdateProfile, useTravelStats } from '../lib/profile/hooks';
import { useFollowStats } from '../lib/social/hooks';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Icon } from '../components/ui/Icon';

const LANGUAGES_SPOKEN = [
  ['fr', 'Français'], ['ar', 'العربية'], ['en', 'English'],
  ['ber', 'Tamazight'], ['sn', 'Shona'], ['nd', 'Ndebele'],
];

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export default function ProfileScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;

  const { data: profile, isLoading } = useProfile(userId);
  const { data: stats } = useTravelStats(userId, market);
  const { data: followStats } = useFollowStats(userId);
  const updateProfile = useUpdateProfile(userId);

  const onInvite = () => Share.share({
    message: 'Join me on 4forty4 — discover the best places and events around you. https://4forty4.app',
  }).catch(() => {});

  const [bio, setBio] = useState('');
  const [favoriteCategories, setFav] = useState([]);
  const [interests, setInterests] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [interestDraft, setInterestDraft] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setBio(profile.bio ?? '');
    setFav(profile.favoriteCategories ?? []);
    setInterests(profile.interests ?? []);
    setLanguages(profile.languages ?? []);
  }, [profile]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      (profile.bio ?? '') !== bio ||
      !sameSet(profile.favoriteCategories ?? [], favoriteCategories) ||
      !sameSet(profile.interests ?? [], interests) ||
      !sameSet(profile.languages ?? [], languages)
    );
  }, [profile, bio, favoriteCategories, interests, languages]);

  const toggle = (setter, list, value) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const addInterest = () => {
    const v = interestDraft.trim();
    if (v && !interests.includes(v)) setInterests([...interests, v]);
    setInterestDraft('');
  };

  const save = () => updateProfile.mutate({ bio, favoriteCategories, interests, languages });

  // Logged out -> premium in-tab gateway. Success hot-swaps to the dashboard
  // below via the session state change; "guest" jumps to Explore.
  if (!session) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <AuthGateway onGuest={() => navigation.navigate('BrowseTab')} />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  const displayName = profile?.fullName || profile?.email || t('profile.explorer');
  const initial = (displayName[0] ?? '?').toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          {profile?.avatarUrl
            ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarFallback]}><AppText color={colors.onAccent} style={styles.avatarInitial}>{initial}</AppText></View>}
          <View style={styles.identity}>
            <AppText variant="title" numberOfLines={1}>{displayName}</AppText>
            {profile?.email ? <AppText variant="label" color={colors.textLo} numberOfLines={1} style={styles.email}>{profile.email}</AppText> : null}
          </View>
          <TouchableOpacity style={styles.gearBtn} onPress={() => navigation.navigate('Settings')} hitSlop={8}>
            <Icon name="settings" size={22} color={colors.textHi} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {[['placesExplored', 'profile.statsExplored'], ['placesSaved', 'profile.statsSaved'], ['plansCreated', 'profile.statsPlans'], ['categoriesExplored', 'profile.statsCategories']].map(([key, label]) => (
            <View key={key} style={styles.statTile}>
              <AppText variant="title">{stats?.[key] ?? 0}</AppText>
              <AppText variant="caption" color={colors.textLo} style={styles.statLabel}>{t(label)}</AppText>
            </View>
          ))}
        </View>
        {stats?.topCategory ? (
          <AppText variant="label" color={colors.textLo} style={styles.topCat}>{t('profile.mostExplored')}: <AppText variant="label" color={colors.textHi}>{stats.topCategory}</AppText></AppText>
        ) : null}

        <View style={styles.followRow}>
          <TouchableOpacity style={styles.followStat} onPress={() => navigation.navigate('FollowList', { userId, mode: 'followers', title: 'Followers' })}>
            <AppText variant="bodySemi">{followStats?.followers ?? 0}</AppText>
            <AppText variant="label" color={colors.textLo}>Followers</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.followStat} onPress={() => navigation.navigate('FollowList', { userId, mode: 'following', title: 'Following' })}>
            <AppText variant="bodySemi">{followStats?.following ?? 0}</AppText>
            <AppText variant="label" color={colors.textLo}>Following</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.followStat, styles.activityLink]} onPress={() => navigation.navigate('Activity')}>
            <Icon name="spark" size={18} color={colors.accent2} />
            <AppText variant="label" color={colors.accent2}>Activity</AppText>
          </TouchableOpacity>
        </View>

        <CreatorStats userId={userId} />

        {/* Flagship showcase — standalone asset card with breathing room above & below. */}
        <View style={styles.radarSlot}>
          <RadarShowcaseCard onPress={() => setRadarOpen(true)} />
        </View>

        {/* Operational actions — one grouped list with inset hairline separators. */}
        <View style={styles.actionCard}>
          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('Merch')} activeOpacity={0.7}>
            <AppText style={styles.actionIcon}>👑</AppText>
            <AppText variant="bodyMed" style={styles.actionLabel}>Support & Official Merch</AppText>
            <Icon name="chevronRight" size={18} color={colors.textMute} />
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('OrganizerHub')} activeOpacity={0.7}>
            <AppText style={styles.actionIcon}>🏪</AppText>
            <AppText variant="bodyMed" style={styles.actionLabel}>{t('organizer.manageBusiness')}</AppText>
            <Icon name="chevronRight" size={18} color={colors.textMute} />
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => setSuggestOpen(true)} activeOpacity={0.7}>
            <AppText style={styles.actionIcon}>📍</AppText>
            <AppText variant="bodyMed" style={styles.actionLabel}>{t('coordination.suggestPlace')}</AppText>
            <Icon name="chevronRight" size={18} color={colors.textMute} />
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity style={styles.actionRow} onPress={onInvite} activeOpacity={0.7}>
            <AppText style={styles.actionIcon}>💌</AppText>
            <AppText variant="bodyMed" style={styles.actionLabel}>Invite friends</AppText>
            <Icon name="chevronRight" size={18} color={colors.textMute} />
          </TouchableOpacity>
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('profile.bio')}</AppText>
        <TextInput
          style={[styles.input, styles.bio]}
          value={bio} onChangeText={setBio}
          placeholder={t('profile.bioPlaceholder')} placeholderTextColor={colors.textMute}
          multiline maxLength={200}
        />

        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('profile.favoriteCategories')}</AppText>
        <View style={styles.wrapRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={favoriteCategories.includes(c)} tint={CATEGORY_COLORS[c]} onPress={() => toggle(setFav, favoriteCategories, c)} style={styles.pill} />
          ))}
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('profile.interests')}</AppText>
        <View style={styles.interestInputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={interestDraft} onChangeText={setInterestDraft}
            placeholder={t('profile.interestsPlaceholder')} placeholderTextColor={colors.textMute}
            autoCapitalize="none" returnKeyType="done" onSubmitEditing={addInterest}
          />
          <Button label={t('common.add')} full={false} onPress={addInterest} style={styles.addBtn} />
        </View>
        {interests.length > 0 && (
          <View style={styles.wrapRow}>
            {interests.map((tg) => (
              <TouchableOpacity key={tg} style={styles.tagChip} onPress={() => setInterests(interests.filter((x) => x !== tg))}>
                <AppText variant="label" color={colors.accent2}>{tg}  ✕</AppText>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>{t('profile.languagesSpoken')}</AppText>
        <View style={styles.wrapRow}>
          {LANGUAGES_SPOKEN.map(([code, label]) => (
            <Chip key={code} label={label} selected={languages.includes(code)} onPress={() => toggle(setLanguages, languages, code)} style={styles.pill} />
          ))}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>
      </KeyboardAwareView>

      {dirty && (
        <View style={styles.saveBar}>
          <Button label={t('common.saveChanges')} loading={updateProfile.isPending} onPress={save} />
        </View>
      )}

      <RequestPlaceModal visible={suggestOpen} onClose={() => setSuggestOpen(false)} userId={userId} market={market} />
      <RadarUpsellModal visible={radarOpen} onClose={() => setRadarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: space.lg, paddingTop: space.md },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.base },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.bgElevated2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  // lineHeight must be >= fontSize or the glyph clips (AppText inherits the body
  // variant's tighter lineHeight when only fontSize is overridden).
  avatarInitial: { fontSize: 26, lineHeight: 32, fontFamily: fonts.bodyBold, includeFontPadding: false, textAlignVertical: 'center' },
  identity: { flex: 1 },
  email: { marginTop: 2 },
  gearBtn: { padding: 6 },
  gear: { fontSize: 24, color: colors.textHi },

  statsRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  statTile: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: space.base, alignItems: 'center' },
  statLabel: { marginTop: 3 },
  topCat: { marginTop: 6 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: space.xl, marginTop: space.md },
  followStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityLink: { marginLeft: 'auto', gap: 5 },
  // Flagship showcase gets deliberate air above (from the grids) and below (the list).
  radarSlot: { marginTop: space.xxl, marginBottom: space.xl },

  // Operational actions: one grouped card, light rows, inset hairline separators.
  actionCard: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 15, paddingHorizontal: space.base },
  actionIcon: { fontSize: 18, lineHeight: 24, width: 22, textAlign: 'center' },
  actionLabel: { flex: 1 },
  actionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.base + 18 + space.md },

  sectionLabel: { marginTop: space.xxl, marginBottom: space.md },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  bio: { minHeight: 64, textAlignVertical: 'top' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: { paddingVertical: 8, paddingHorizontal: 15 },
  interestInputRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  addBtn: { paddingHorizontal: space.base },
  tagChip: { backgroundColor: 'rgba(79,163,199,0.14)', borderWidth: 1, borderColor: 'rgba(79,163,199,0.35)', borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13 },

  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.base, backgroundColor: colors.bgBase, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
