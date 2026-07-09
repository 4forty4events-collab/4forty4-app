import React, { useEffect, useMemo, useState } from 'react';
import {
  View, TextInput, ScrollView, TouchableOpacity, Image, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { CATEGORIES, CATEGORY_COLORS } from '../lib/categories';
import { AuthGateway } from '../components/auth/AuthGateway';
import { CreatorStats } from '../components/community/CreatorStats';
import { RequestPlaceModal } from '../components/coordination/RequestPlaceModal';
import { useProfile, useUpdateProfile, useTravelStats } from '../lib/profile/hooks';
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
  const updateProfile = useUpdateProfile(userId);

  const [bio, setBio] = useState('');
  const [favoriteCategories, setFav] = useState([]);
  const [interests, setInterests] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [interestDraft, setInterestDraft] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);

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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
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

        <CreatorStats userId={userId} />

        <TouchableOpacity style={styles.portalRow} onPress={() => navigation.navigate('OrganizerHub')}>
          <AppText style={styles.portalIcon}>🏪</AppText>
          <AppText variant="bodySemi" style={styles.portalText}>{t('organizer.manageBusiness')}</AppText>
          <Icon name="chevronRight" size={18} color={colors.textMute} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.portalRow} onPress={() => setSuggestOpen(true)}>
          <AppText style={styles.portalIcon}>📍</AppText>
          <AppText variant="bodySemi" style={styles.portalText}>{t('coordination.suggestPlace')}</AppText>
          <Icon name="chevronRight" size={18} color={colors.textMute} />
        </TouchableOpacity>

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
            <Chip key={c} label={c} selected={favoriteCategories.includes(c)} tint={CATEGORY_COLORS[c]} onPress={() => toggle(setFav, favoriteCategories, c)} />
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
            <Chip key={code} label={label} selected={languages.includes(code)} onPress={() => toggle(setLanguages, languages, code)} />
          ))}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      {dirty && (
        <View style={styles.saveBar}>
          <Button label={t('common.saveChanges')} loading={updateProfile.isPending} onPress={save} />
        </View>
      )}

      <RequestPlaceModal visible={suggestOpen} onClose={() => setSuggestOpen(false)} userId={userId} market={market} />
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
  avatarInitial: { fontSize: 26, fontFamily: fonts.bodyBold },
  identity: { flex: 1 },
  email: { marginTop: 2 },
  gearBtn: { padding: 6 },
  gear: { fontSize: 24, color: colors.textHi },

  statsRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  statTile: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: space.base, alignItems: 'center' },
  statLabel: { marginTop: 3 },
  topCat: { marginTop: 6 },
  portalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.base },
  portalIcon: { fontSize: 20 },
  portalText: { flex: 1 },
  portalChevron: { fontSize: 18 },

  sectionLabel: { marginTop: space.xl, marginBottom: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  bio: { minHeight: 64, textAlignVertical: 'top' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  interestInputRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  addBtn: { paddingHorizontal: space.base },
  tagChip: { backgroundColor: 'rgba(79,163,199,0.14)', borderWidth: 1, borderColor: 'rgba(79,163,199,0.35)', borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13 },

  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.base, backgroundColor: colors.bgBase, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
