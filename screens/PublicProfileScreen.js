import React from 'react';
import { View, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { usePublicProfile, useFollowStats, useToggleFollow } from '../lib/social/hooks';
import { usePublicCollections } from '../lib/collections/hooks';
import { TrustBadge } from '../components/safety/TrustBadge';
import { FollowButton } from '../components/social/FollowButton';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

function CountStat({ n, label, onPress }) {
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress} disabled={!onPress}>
      <AppText variant="title">{n}</AppText>
      <AppText variant="caption" color={colors.textLo}>{label}</AppText>
    </TouchableOpacity>
  );
}

// Someone else's public profile: identity + trust, follower/following counts (tap
// through to the lists), a follow toggle, and the collections they've shared. Reached
// from a review author, a creator, or the activity feed.
export default function PublicProfileScreen({ route, navigation }) {
  const { session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const userId = route.params?.userId;
  const isSelf = viewerId && viewerId === userId;

  const { data: profile, isLoading } = usePublicProfile(userId);
  const { data: stats } = useFollowStats(userId);
  const { data: collections = [] } = usePublicCollections(userId);
  const toggle = useToggleFollow(viewerId);

  const name = profile?.full_name || 'Explorer';
  const initial = (name[0] ?? '?').toUpperCase();
  const isFollowing = !!stats?.isFollowing;

  const onFollow = () => {
    if (!viewerId) { navigation.navigate('SignIn'); return; }
    toggle.mutate({ targetId: userId, follow: !isFollowing });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">Profile</AppText>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headRow}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              : <View style={[styles.avatar, styles.avatarFallback]}><AppText color={colors.onAccent} style={styles.avatarInitial}>{initial}</AppText></View>}
            <View style={styles.identity}>
              <View style={styles.nameRow}>
                <AppText variant="title" numberOfLines={1}>{name}</AppText>
                <TrustBadge tier={profile?.trust_tier} compact />
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <CountStat n={stats?.followers ?? 0} label="Followers" onPress={() => navigation.navigate('FollowList', { userId, mode: 'followers', title: 'Followers' })} />
            <CountStat n={stats?.following ?? 0} label="Following" onPress={() => navigation.navigate('FollowList', { userId, mode: 'following', title: 'Following' })} />
          </View>

          {!isSelf && (
            <FollowButton isFollowing={isFollowing} loading={toggle.isPending} onPress={onFollow} style={styles.followBtn} />
          )}

          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>SHARED COLLECTIONS</AppText>
          {collections.length === 0 ? (
            <AppText variant="body" color={colors.textLo} style={styles.empty}>No public collections yet.</AppText>
          ) : (
            collections.map((c) => (
              <TouchableOpacity key={c.id} style={styles.colRow} onPress={() => navigation.navigate('PublicCollection', { collection: c })}>
                <AppText variant="title" style={styles.colEmoji}>{c.emoji ?? '📁'}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySemi" numberOfLines={1}>{c.name}</AppText>
                  <AppText variant="label" color={colors.textLo}>{c.count} {c.count === 1 ? 'place' : 'places'}</AppText>
                </View>
                <Icon name="chevronRight" size={18} color={colors.textMute} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: space.base, gap: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.base },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 26, fontWeight: '700' },
  identity: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  statsRow: { flexDirection: 'row', gap: space.xl, paddingVertical: space.xs },
  stat: { alignItems: 'flex-start', gap: 2 },
  followBtn: { alignSelf: 'flex-start' },
  sectionLabel: { marginTop: space.sm },
  empty: { paddingVertical: space.sm },
  colRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  colEmoji: { width: 40, textAlign: 'center' },
});
