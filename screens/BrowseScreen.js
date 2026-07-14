import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, FlatList, ScrollView, Pressable, Share, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useSession } from '../providers/SessionProvider';
import { useLocation } from '../providers/LocationProvider';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { useDiscovery } from '../lib/discovery/hooks/useDiscovery';
import { useForYou } from '../lib/discovery/hooks/useForYou';
import { useFeedPosts } from '../lib/community/hooks';
import { setHelpful, fetchMyHelpful } from '../lib/community/communityRepository';
import { useActivityFeed, useMomentPosts, useDeletePost } from '../lib/social/hooks';
import { setPostLike, fetchMyPostLikes } from '../lib/social/postsRepository';
import { addSave, removeSave } from '../lib/saves';
import { PostCard } from '../components/social/PostCard';
import { ActivityRow } from '../components/social/ActivityRow';
import { ExperienceCard } from '../components/discovery/ExperienceCard';
import { AppText, colors, space, radius } from '../lib/theme';
import { Chip } from '../components/ui/Chip';
import { Icon } from '../components/ui/Icon';

// The pills. The first five are social/discovery modes; the rest map to catalogue
// categories. "For You" mixes real user moments (reviews-with-photos) with recommendations
// and friend activity; "Friends" is the follow activity feed; the rest are listing queries.
const PILLS = [
  { key: 'foryou', label: 'For You' },
  { key: 'trending', label: 'Trending' },
  { key: 'friends', label: 'Friends' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'weekend', label: 'This Weekend' },
  { key: 'gems', label: 'Hidden Gems' },
  { key: 'restaurant', label: 'Food' },
  { key: 'nightlife', label: 'Nightlife' },
  { key: 'cafe', label: 'Coffee' },
];

// Feed — the social surface: "what are people experiencing right now?" Reached from the
// Discover pill (so it can open on a category). Reuses existing data — no new tables:
// reviews-with-photos become posts, useForYou drives Recommended, the follow graph drives
// Friends activity, and listing cards fill in when a query has no user moments yet.
export default function BrowseScreen({ navigation, route }) {
  const { market } = useMarket();
  const { session } = useSession();
  const { coords } = useLocation();
  const userId = session?.user?.id ?? null;

  const initialPill = route?.params?.category && route.params.category !== 'all' ? route.params.category : 'foryou';
  const [pill, setPill] = useState(initialPill);
  const [savedMap, setSavedMap] = useState({}); // `${kind}-${id}` -> bool
  const [likedMap, setLikedMap] = useState({}); // reviewId -> bool

  // Listing query behind the current pill (also the fallback for an empty "For You").
  const pillQuery = useMemo(() => {
    switch (pill) {
      case 'trending': return discoveryService.trending({ market });
      case 'nearby': return discoveryService.nearby({ market, near: coords });
      case 'weekend': return discoveryService.weekend({ market });
      case 'gems': return discoveryService.hiddenGems({ market });
      case 'foryou':
      case 'friends': return discoveryService.feed({ market });
      default: return discoveryService.feed({ market, categories: [pill] });
    }
  }, [pill, market, coords]);
  const { items: listingItems = [], isLoading: listingLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useDiscovery(pillQuery);

  // The moments feed = real user posts + reviews-with-photos, newest first.
  const { data: reviewPosts = [], isLoading: reviewLoading } = useFeedPosts(market);
  const { data: momentPosts = [], isLoading: momentLoading } = useMomentPosts(market);
  const posts = useMemo(
    () => [...momentPosts, ...reviewPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [momentPosts, reviewPosts],
  );
  const postsLoading = reviewLoading || momentLoading;
  const del = useDeletePost();
  const { items: recItems = [] } = useForYou({ userId, market, near: coords });
  const activity = useActivityFeed(!!session);
  const activityRows = useMemo(() => (activity.data?.pages ?? []).flatMap((p) => p.rows), [activity.data]);

  // Seed like state from the server once posts arrive (keyed by `${source}-${id}` so review
  // "helpful" and post likes never collide). Reviews use helpful-reactions; posts use likes.
  useEffect(() => {
    if (!userId || posts.length === 0) return;
    let cancelled = false;
    const reviewIds = posts.filter((p) => p.source === 'review').map((p) => p.id);
    const postIds = posts.filter((p) => p.source === 'post').map((p) => p.id);
    Promise.all([fetchMyHelpful(userId, reviewIds), fetchMyPostLikes(userId, postIds)])
      .then(([helpful, likes]) => {
        if (cancelled) return;
        setLikedMap((m) => {
          const n = { ...m };
          posts.forEach((p) => {
            const key = `${p.source}-${p.id}`;
            if (!(key in n)) n[key] = p.source === 'review' ? helpful.has(p.id) : likes.has(p.id);
          });
          return n;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, posts]);

  const requireAuth = useCallback(() => {
    if (!userId) { navigation.navigate('SignIn'); return false; }
    return true;
  }, [userId, navigation]);

  const openPlace = useCallback((place) => {
    if (!place) return;
    navigation.navigate('ListingDetail', place.title ? { item: place } : { id: place.id, kind: place.kind });
  }, [navigation]);

  const onToggleSave = useCallback((target, next) => {
    if (!target || !requireAuth()) return;
    const key = `${target.kind}-${target.id}`;
    setSavedMap((m) => ({ ...m, [key]: next }));
    const op = next ? addSave(userId, target.kind, target.id) : removeSave(userId, target.kind, target.id);
    op.catch(() => setSavedMap((m) => ({ ...m, [key]: !next })));
  }, [userId, requireAuth]);

  const onToggleLike = useCallback((post, next) => {
    if (!requireAuth()) return;
    const key = `${post.source}-${post.id}`;
    setLikedMap((m) => ({ ...m, [key]: next }));
    const op = post.source === 'post' ? setPostLike(userId, post.id, next) : setHelpful(userId, post.id, next);
    op.catch(() => setLikedMap((m) => ({ ...m, [key]: !next })));
  }, [userId, requireAuth]);

  const onDeletePost = useCallback((post) => {
    del.mutate(post.id, { onError: (e) => Alert.alert('Could not delete', String(e?.message ?? e)) });
  }, [del]);

  const onShare = useCallback((post) => {
    const where = post.place ? ` at ${post.place.name}` : '';
    Share.share({ message: `${post.body ? `"${post.body}"` : 'A spot'}${where} — on 4forty4` }).catch(() => {});
  }, []);

  const onOpenActor = useCallback((actorId) => actorId && navigation.navigate('PublicProfile', { userId: actorId }), [navigation]);
  const onOpenActivity = useCallback((a) => {
    if (a.verb === 'followed' && a.subject_id) navigation.navigate('PublicProfile', { userId: a.subject_id });
    else if (a.verb === 'shared_collection' && a.collection_id) navigation.navigate('PublicCollection', { collection: { id: a.collection_id, name: a.target_title, emoji: null } });
    else if (a.venue_id) navigation.navigate('ListingDetail', { id: a.venue_id, kind: 'venue' });
    else if (a.event_id) navigation.navigate('ListingDetail', { id: a.event_id, kind: 'event' });
  }, [navigation]);

  const isForYou = pill === 'foryou';
  const isFriends = pill === 'friends';
  const usePosts = isForYou && posts.length > 0;
  const mainData = isFriends ? activityRows : usePosts ? posts : listingItems;
  const renderKind = isFriends ? 'activity' : usePosts ? 'post' : 'listing';
  const loading = isFriends ? activity.isLoading : usePosts ? postsLoading : listingLoading;

  const onEndReached = useCallback(() => {
    if (isFriends) { if (activity.hasNextPage && !activity.isFetchingNextPage) activity.fetchNextPage(); return; }
    if (renderKind === 'listing' && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [isFriends, activity, renderKind, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(({ item }) => {
    if (renderKind === 'activity') return <ActivityRow activity={item} onOpen={onOpenActivity} onOpenActor={onOpenActor} />;
    if (renderKind === 'post') {
      const savedKey = item.place ? `${item.place.kind}-${item.place.id}` : null;
      return (
        <PostCard
          post={item}
          liked={!!likedMap[`${item.source}-${item.id}`]}
          saved={savedKey ? !!savedMap[savedKey] : false}
          canDelete={item.source === 'post' && item.ownerId === userId}
          onDelete={onDeletePost}
          onToggleLike={onToggleLike}
          onToggleSave={onToggleSave}
          onOpenPlace={openPlace}
          onShare={onShare}
        />
      );
    }
    return (
      <ExperienceCard
        item={item}
        onPress={() => openPlace(item)}
        onAddToTrip={undefined}
      />
    );
  }, [renderKind, likedMap, savedMap, userId, onDeletePost, onToggleLike, onToggleSave, openPlace, onShare, onOpenActivity, onOpenActor]);

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back to Discover">
            <Icon name="chevronLeft" size={24} color={colors.textHi} />
          </Pressable>
          <View>
            <AppText variant="display" style={styles.title}>Feed</AppText>
            <AppText variant="label" color={colors.textLo}>See what people are experiencing</AppText>
          </View>
        </View>
        {session ? (
          <Pressable style={styles.iconRound} onPress={() => navigation.navigate('Notifications')} hitSlop={6} accessibilityLabel="Notifications">
            <Icon name="bell" size={19} color={colors.textHi} />
          </Pressable>
        ) : (
          <Pressable style={styles.iconRound} onPress={() => navigation.navigate('SignIn')} hitSlop={6}>
            <AppText variant="label" color={colors.textHi}>Sign in</AppText>
          </Pressable>
        )}
      </View>

      <Pressable style={styles.searchBox} onPress={() => navigation.navigate('Search')}>
        <Icon name="search" size={17} color={colors.textMute} />
        <AppText variant="body" color={colors.textMute}>Search posts, places, people…</AppText>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pills} contentContainerStyle={styles.pillsContent}>
        {PILLS.map((p) => (
          <Chip key={p.key} label={p.label} selected={pill === p.key} onPress={() => setPill(p.key)} />
        ))}
      </ScrollView>

      {isForYou && recItems.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="title" style={styles.sectionTitle}>Recommended for you</AppText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recRow}>
            {recItems.slice(0, 8).map((it, i) => (
              <View key={`${it.kind}-${it.id}-${i}`} style={styles.recSlot}>
                <ExperienceCard item={it} width={230} onPress={() => openPlace(it)} />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {isForYou && activityRows.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="title" style={styles.sectionTitle}>Friends activity</AppText>
            <Pressable onPress={() => navigation.navigate('Activity')} hitSlop={8}>
              <AppText variant="label" color={colors.accent2}>See all</AppText>
            </Pressable>
          </View>
          {activityRows.slice(0, 3).map((a) => (
            <ActivityRow key={a.id} activity={a} onOpen={onOpenActivity} onOpenActor={onOpenActor} />
          ))}
        </View>
      ) : null}

      {renderKind === 'post' ? (
        <View style={styles.sectionHead}><AppText variant="title" style={styles.sectionTitle}>Recent moments</AppText></View>
      ) : null}
    </View>
  );

  const empty = loading ? (
    <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
  ) : isFriends && !session ? (
    <View style={styles.center}>
      <AppText variant="title" style={styles.centerText}>Sign in to see friends</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.centerText}>Follow people and see what they discover.</AppText>
    </View>
  ) : (
    <View style={styles.center}>
      <AppText variant="body" color={colors.textLo} style={styles.centerText}>
        {isFriends ? 'Nothing yet — follow people to fill your feed.' : 'Nothing here yet. Check back soon.'}
      </AppText>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={mainData}
        keyExtractor={(it, i) => `${it.kind ?? 'x'}-${it.id}-${i}`}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={(isFetchingNextPage || activity.isFetchingNextPage) ? <ActivityIndicator style={styles.footer} color={colors.textLo} /> : <View style={{ height: space.xl }} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      {/* Share a Moment — the floating create button. */}
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate(userId ? 'ComposeMoment' : 'SignIn')}
        accessibilityLabel="Share a moment"
      >
        <Icon name="plus" size={26} color={colors.onAccent} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  listContent: { paddingTop: space.sm },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, marginBottom: space.md },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  title: { fontSize: 30, lineHeight: 34 },
  iconRound: { minWidth: 42, height: 42, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: space.md },

  pills: { flexGrow: 0, marginBottom: space.lg },
  pillsContent: { paddingHorizontal: space.base, gap: space.sm, alignItems: 'center' },

  section: { marginBottom: space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, marginBottom: space.sm },
  sectionTitle: { fontSize: 20 },
  recRow: { paddingHorizontal: space.base, gap: space.md },
  recSlot: { width: 230 },

  center: { paddingVertical: space.huge, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  footer: { paddingVertical: space.lg },

  fab: { position: 'absolute', right: space.base, bottom: space.xl, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
});
