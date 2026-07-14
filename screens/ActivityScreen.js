import React, { useCallback } from 'react';
import { View, Image, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useActivityFeed } from '../lib/social/hooks';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/Button';

const VERB_ICON = { reviewed: 'star', shared_collection: 'bookmark', followed: 'heart' };

// Compact "time ago" for feed rows (no i18n dependency — the feed is chronological
// context, not precise timestamps).
function formatRelative(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({ url, name }) {
  const initial = ((name ?? '?')[0] ?? '?').toUpperCase();
  return url
    ? <Image source={{ uri: url }} style={styles.avatar} />
    : <View style={[styles.avatar, styles.avatarFallback]}><AppText color={colors.onAccent} style={styles.avatarInitial}>{initial}</AppText></View>;
}

// The friend-activity feed: what the people you follow have been doing — reviews,
// shared collections, new follows. Each row deep-links to the thing it's about.
export default function ActivityScreen({ navigation }) {
  const { session } = useSession();
  const {
    data, isLoading, isError, refetch, isRefetching,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useActivityFeed(!!session);

  const rows = (data?.pages ?? []).flatMap((p) => p.rows);

  const onEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openTarget = (a) => {
    if (a.verb === 'followed' && a.subject_id) navigation.navigate('PublicProfile', { userId: a.subject_id });
    else if (a.verb === 'shared_collection' && a.collection_id) navigation.navigate('PublicCollection', { collection: { id: a.collection_id, name: a.target_title, emoji: null } });
    else if (a.venue_id) navigation.navigate('ListingDetail', { id: a.venue_id, kind: 'venue' });
    else if (a.event_id) navigation.navigate('ListingDetail', { id: a.event_id, kind: 'event' });
  };

  const phrase = (a) => {
    if (a.verb === 'reviewed') return { verb: 'reviewed', obj: a.target_title };
    if (a.verb === 'shared_collection') return { verb: 'shared a collection', obj: a.target_title };
    return { verb: 'started following', obj: a.subject_name };
  };

  if (!session) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="title" style={styles.centerText}>Sign in to see activity</AppText>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>Follow people and see what they discover.</AppText>
        <Button label="Sign in" full={false} onPress={() => navigation.navigate('SignIn')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">Activity</AppText>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        onEndReached={onEnd}
        onEndReachedThreshold={0.5}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
          ) : isError ? (
            <View style={styles.center}><AppText variant="body" color={colors.textLo} style={styles.centerText}>Couldn’t load activity.</AppText></View>
          ) : (
            <View style={styles.center}>
              <AppText variant="body" color={colors.textLo} style={styles.centerText}>Nothing yet — follow people to fill your feed.</AppText>
            </View>
          )
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ paddingVertical: space.lg }} color={colors.textLo} /> : null}
        renderItem={({ item: a }) => {
          const p = phrase(a);
          return (
            <TouchableOpacity style={styles.row} onPress={() => openTarget(a)}>
              <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: a.actor_id })} hitSlop={6}>
                <Avatar url={a.actor_avatar} name={a.actor_name} />
              </TouchableOpacity>
              <View style={styles.rowBody}>
                <AppText variant="body" numberOfLines={2}>
                  <AppText variant="bodySemi">{a.actor_name || 'Someone'}</AppText>
                  {` ${p.verb} `}
                  {p.obj ? <AppText variant="bodySemi">{p.obj}</AppText> : null}
                </AppText>
                <AppText variant="caption" color={colors.textMute}>{formatRelative(a.created_at)}</AppText>
              </View>
              {a.target_image
                ? <Image source={{ uri: a.target_image }} style={styles.thumb} />
                : <View style={styles.verbBadge}><Icon name={VERB_ICON[a.verb] ?? 'spark'} size={16} color={colors.textLo} /></View>}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base, paddingTop: space.huge },
  centerText: { textAlign: 'center' },
  list: { padding: space.base, gap: space.sm, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowBody: { flex: 1, gap: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontWeight: '700' },
  thumb: { width: 46, height: 46, borderRadius: radius.sm },
  verbBadge: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
});
