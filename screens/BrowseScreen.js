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
import { useActivityFeed, useMomentPosts, useDeletePost, useFollowList, useActiveTravelers, useActiveStories } from '../lib/social/hooks';
import { setPostLike, fetchMyPostLikes } from '../lib/social/postsRepository';
import { setStoryLike, fetchMyStoryLikes } from '../lib/social/storiesRepository';
import { sendMessage } from '../lib/social/messagesRepository';
import { rankFeed } from '../lib/social/feedRanking';
import { useDwellTracker } from '../lib/social/useDwellTracker';
import { useProfile } from '../lib/profile/hooks';
import { addSave, removeSave } from '../lib/saves';
import { PostCard } from '../components/social/PostCard';
import { PostCommentsSheet } from '../components/social/PostCommentsSheet';
import { ActivityRow } from '../components/social/ActivityRow';
import { ReportModal } from '../components/safety/ReportModal';
import { ExperienceCard } from '../components/discovery/ExperienceCard';
import { StoriesBar } from '../components/feed/StoriesBar';
import { FeedHeroCard } from '../components/feed/FeedHeroCard';
import { TrendingRow } from '../components/feed/TrendingRow';
import { FriendsActivityCard } from '../components/feed/FriendsActivityCard';
import { CreateMenuSheet } from '../components/feed/CreateMenuSheet';
import { StoryViewer } from '../components/feed/StoryViewer';
import { DEMO_FEED, DEMO_STORIES, DEMO_EVENT } from '../components/feed/demoFeed';
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
  { key: 'restaurant', label: 'Food' },
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
  const [likedMap, setLikedMap] = useState({}); // `${source}-${id}` -> bool
  const [commentPost, setCommentPost] = useState(null); // open comments sheet for this post
  const [reportPost, setReportPost] = useState(null);   // open report sheet for this post
  const [createOpen, setCreateOpen] = useState(false);  // FAB create menu
  const [openStories, setOpenStories] = useState(null); // the selected author's story set (array), or null
  const [storyLikes, setStoryLikes] = useState(() => new Set()); // story ids I've liked, for the open set

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
  const { data: viewerProfile } = useProfile(userId);
  // Engagement-ranked (likes + comments + watch/dwell), decayed by freshness; cold-start
  // posts fall back to recency + the viewer's favourite-category interest. See feedRanking.
  const posts = useMemo(
    () => rankFeed([...momentPosts, ...reviewPosts], { interestCategories: viewerProfile?.favoriteCategories ?? [] }),
    [momentPosts, reviewPosts, viewerProfile?.favoriteCategories],
  );
  const postsLoading = reviewLoading || momentLoading;
  // Times how long posts sit in the viewport -> content_views (dwell), feeding the ranker.
  const dwellPairs = useDwellTracker({ userId, market });
  const del = useDeletePost();
  const { items: recItems = [] } = useForYou({ userId, market, near: coords });
  const activity = useActivityFeed(!!session);
  const activityRows = useMemo(() => (activity.data?.pages ?? []).flatMap((p) => p.rows), [activity.data]);

  // People for the stories row: who you follow, falling back to recently-active travelers.
  const followList = useFollowList(userId, 'following');
  const travelers = useActiveTravelers(market, userId);
  const people = useMemo(() => {
    const src = (followList.data?.length ? followList.data : travelers.data) ?? [];
    return src.slice(0, 12).map((p) => ({ id: p.id, name: p.full_name, avatarUrl: p.avatar_url }));
  }, [followList.data, travelers.data]);
  const meta = session?.user?.user_metadata ?? {};
  const me = { name: meta.full_name || meta.name, avatarUrl: meta.avatar_url || meta.picture };

  // Real active stories (24h), grouped per author — the tray's primary content.
  // Excludes my own (I get "Your story" separately). Empty until someone posts one.
  const { data: storyGroups = [] } = useActiveStories(market, userId);

  // A real upcoming event for the Trending row's EVENT card.
  const eventQuery = useMemo(() => discoveryService.weekend({ market }), [market]);
  const { items: eventItems = [] } = useDiscovery(eventQuery, { enabled: pill === 'foryou' });

  // Demo showcase: only when For You has finished loading with NO real posts. Sample
  // content (see demoFeed) fills the screen so it looks alive; real posts replace it.
  const useDemo = pill === 'foryou' && !postsLoading && posts.length === 0;
  const trendingEvent = eventItems[0] ?? (useDemo ? DEMO_EVENT : null);

  // The stories tray, in priority order: real active stories (authors with unexpired
  // stories) → people you follow (open their profile) → sample handles on an empty
  // feed. Real story authors carry a `.stories` array the viewer plays.
  const storyPeople = useMemo(
    () => (storyGroups.length ? storyGroups : people.length ? people : useDemo ? DEMO_STORIES : []),
    [storyGroups, people, useDemo],
  );

  // Split the For You posts into the immersive slots so nothing repeats: a hero, a
  // multi-photo carousel, a Trending strip, a friends-activity feature, then the rest.
  const feed = useMemo(() => {
    if (pill !== 'foryou') return { hero: null, carousel: null, trendingPosts: [], friendsPost: null, recent: posts };
    if (useDemo) return DEMO_FEED;
    if (posts.length === 0) return { hero: null, carousel: null, trendingPosts: [], friendsPost: null, recent: [] };
    const key = (p) => `${p.source}-${p.id}`;
    const used = new Set();
    const withPhoto = posts.filter((p) => p.photoUrls?.length);
    const hero = withPhoto[0] ?? posts[0];
    if (hero) used.add(key(hero));
    const carousel = withPhoto.find((p) => !used.has(key(p)) && p.photoUrls.length > 1) ?? null;
    if (carousel) used.add(key(carousel));
    const trendingPosts = withPhoto.filter((p) => !used.has(key(p))).slice(0, 6);
    trendingPosts.forEach((p) => used.add(key(p)));
    const friendsPost = withPhoto.find((p) => !used.has(key(p)) && p.photoUrls.length >= 2) ?? null;
    if (friendsPost) used.add(key(friendsPost));
    const recent = posts.filter((p) => !used.has(key(p)));
    return { hero, carousel, trendingPosts, friendsPost, recent };
  }, [pill, useDemo, posts]);

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
    if (place.demo) { navigation.navigate('Search'); return; } // sample card → explore real places
    navigation.navigate('ListingDetail', place.title ? { item: place } : { id: place.id, kind: place.kind });
  }, [navigation]);

  const onToggleSave = useCallback((target, next) => {
    if (!target) return;
    const key = `${target.kind}-${target.id}`;
    if (target.demo) { setSavedMap((m) => ({ ...m, [key]: next })); return; } // sample — local only
    if (!requireAuth()) return;
    setSavedMap((m) => ({ ...m, [key]: next }));
    const op = next ? addSave(userId, target.kind, target.id) : removeSave(userId, target.kind, target.id);
    op.catch(() => setSavedMap((m) => ({ ...m, [key]: !next })));
  }, [userId, requireAuth]);

  const onToggleLike = useCallback((post, next) => {
    const key = `${post.source}-${post.id}`;
    if (post.source === 'demo') { setLikedMap((m) => ({ ...m, [key]: next })); return; } // sample — local only
    if (!requireAuth()) return;
    setLikedMap((m) => ({ ...m, [key]: next }));
    const op = post.source === 'post' ? setPostLike(userId, post.id, next) : setHelpful(userId, post.id, next);
    op.catch(() => setLikedMap((m) => ({ ...m, [key]: !next })));
  }, [userId, requireAuth]);

  const onDeletePost = useCallback((post) => {
    del.mutate(post.id, { onError: (e) => Alert.alert('Could not delete', String(e?.message ?? e)) });
  }, [del]);

  const onReport = useCallback((post) => {
    if (!requireAuth()) return;
    setReportPost(post);
  }, [requireAuth]);

  const onShare = useCallback((post) => {
    const where = post.place ? ` at ${post.place.name}` : '';
    Share.share({ message: `${post.body ? `"${post.body}"` : 'A spot'}${where} — on 4forty4` }).catch(() => {});
  }, []);

  const onOpenActor = useCallback((actorId) => {
    if (!actorId || String(actorId).startsWith('demo')) return; // sample story — no real profile
    navigation.navigate('PublicProfile', { userId: actorId });
  }, [navigation]);

  // Tapping a tray entry: a real story author plays their story set in the viewer; the
  // sample handles play the demo set; a followed person with no active story opens their
  // profile (there's nothing to view).
  const onOpenStory = useCallback((p) => {
    if (!p) return;
    if (Array.isArray(p.stories) && p.stories.length) { setOpenStories(p.stories); return; }
    if (String(p.id).startsWith('demo')) { setOpenStories(DEMO_STORIES); return; }
    navigation.navigate('PublicProfile', { userId: p.id });
  }, [navigation]);

  // Seed which of the open author's stories I've already liked (real stories only).
  useEffect(() => {
    if (!userId || !openStories?.length) return;
    const realIds = openStories.map((s) => s.id).filter((id) => !String(id).startsWith('demo'));
    if (!realIds.length) return;
    let cancelled = false;
    fetchMyStoryLikes(userId, realIds).then((set) => { if (!cancelled) setStoryLikes(set); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, openStories]);

  // Story like: private reaction (optimistic). Sample stories stay local.
  const onToggleStoryLike = useCallback((storyId, on) => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    setStoryLikes((prev) => { const n = new Set(prev); if (on) n.add(storyId); else n.delete(storyId); return n; });
    if (String(storyId).startsWith('demo')) return; // sample — no DB write
    setStoryLike(userId, storyId, on).catch(() => {
      setStoryLikes((prev) => { const n = new Set(prev); if (on) n.delete(storyId); else n.add(storyId); return n; });
    });
  }, [userId, navigation]);

  // Story reply: sends a DM to the poster (never a public comment) and opens the thread.
  const onStoryReply = useCallback(({ authorId, storyId, text }) => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    if (!authorId || String(authorId).startsWith('demo')) {
      Alert.alert('Sample story', 'Replies open up once people post real stories.');
      return;
    }
    const author = storyPeople.find((p) => p.id === authorId);
    sendMessage({ senderId: userId, recipientId: authorId, body: text, storyId })
      .then(() => {
        setOpenStories(null);
        navigation.navigate('DmThread', { otherUserId: authorId, otherName: author?.name ?? 'Chat' });
      })
      .catch((e) => Alert.alert('Could not send', String(e?.message ?? e)));
  }, [userId, navigation, storyPeople]);
  const onOpenActivity = useCallback((a) => {
    if (a.verb === 'followed' && a.subject_id) navigation.navigate('PublicProfile', { userId: a.subject_id });
    else if (a.verb === 'shared_collection' && a.collection_id) navigation.navigate('PublicCollection', { collection: { id: a.collection_id, name: a.target_title, emoji: null } });
    else if (a.venue_id) navigation.navigate('ListingDetail', { id: a.venue_id, kind: 'venue' });
    else if (a.event_id) navigation.navigate('ListingDetail', { id: a.event_id, kind: 'event' });
  }, [navigation]);

  const isForYou = pill === 'foryou';
  const isFriends = pill === 'friends';
  // For You always renders the immersive post layout (real posts, or the demo seed when empty).
  const usePosts = isForYou;
  const mainData = isFriends ? activityRows : usePosts ? feed.recent : listingItems;
  const renderKind = isFriends ? 'activity' : usePosts ? 'post' : 'listing';
  const loading = isFriends ? activity.isLoading : usePosts ? postsLoading : listingLoading;

  // FAB create menu → existing flows. Place-scoped actions route via Search (pick a place).
  const onCreateSelect = useCallback((key) => {
    switch (key) {
      case 'photo':
      case 'video': navigation.navigate('ComposeMoment'); break;
      case 'event': navigation.navigate('OrganizerHub'); break;
      default: navigation.navigate('Search'); break; // review / question / place
    }
  }, [navigation]);

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
          onReport={onReport}
          onOpenComments={setCommentPost}
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
  }, [renderKind, likedMap, savedMap, userId, onDeletePost, onReport, onToggleLike, onToggleSave, openPlace, onShare, onOpenActivity, onOpenActor]);

  const heroLikeKey = feed.hero ? `${feed.hero.source}-${feed.hero.id}` : null;
  const heroSaveKey = feed.hero?.place ? `${feed.hero.place.kind}-${feed.hero.place.id}` : null;

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          {navigation.canGoBack() ? (
            <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back">
              <Icon name="chevronLeft" size={24} color={colors.textHi} />
            </Pressable>
          ) : null}
          <View>
            <AppText variant="display" style={styles.title}>Feed</AppText>
            <AppText variant="label" color={colors.textLo}>See what people are experiencing</AppText>
          </View>
        </View>
        <View style={styles.headerIcons}>
          {session ? (
            <>
              <Pressable style={styles.iconRound} onPress={() => navigation.navigate('Notifications')} hitSlop={6} accessibilityLabel="Notifications">
                <Icon name="bell" size={19} color={colors.textHi} />
              </Pressable>
              <Pressable style={styles.iconRound} onPress={() => navigation.navigate('Conversations')} hitSlop={6} accessibilityLabel="Messages">
                <Icon name="comment" size={19} color={colors.textHi} />
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.iconRound} onPress={() => navigation.navigate('SignIn')} hitSlop={6}>
              <AppText variant="label" color={colors.textHi}>Sign in</AppText>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.searchRow}>
        <Pressable style={styles.searchBox} onPress={() => navigation.navigate('Search')}>
          <Icon name="search" size={17} color={colors.textMute} />
          <AppText variant="body" color={colors.textMute}>Search posts, places, people…</AppText>
        </Pressable>
        <Pressable style={styles.filterBtn} onPress={() => navigation.navigate('Search')} accessibilityLabel="Filters">
          <Icon name="settings" size={19} color={colors.textHi} />
        </Pressable>
      </View>

      {isForYou ? (
        <StoriesBar
          me={me}
          people={storyPeople}
          onOpenStory={onOpenStory}
          onAddStory={() => navigation.navigate(userId ? 'ComposeStory' : 'SignIn')}
        />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pills} contentContainerStyle={styles.pillsContent}>
        {PILLS.map((p) => (
          <Chip key={p.key} label={p.label} selected={pill === p.key} onPress={() => setPill(p.key)} />
        ))}
      </ScrollView>

      {isForYou && feed.hero ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}><AppText variant="title" style={styles.sectionTitle}>Recommended for you</AppText></View>
          <FeedHeroCard
            post={feed.hero}
            liked={!!likedMap[heroLikeKey]}
            saved={heroSaveKey ? !!savedMap[heroSaveKey] : false}
            onToggleLike={onToggleLike}
            onToggleSave={onToggleSave}
            onShare={onShare}
            onOpenPlace={openPlace}
            onOpenComments={(p) => p.source === 'post' && setCommentPost(p)}
          />
        </View>
      ) : null}

      {isForYou && (trendingEvent || feed.carousel || feed.trendingPosts.length > 0) ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="title" style={styles.sectionTitle}>Trending today</AppText>
            <Pressable onPress={() => setPill('trending')} hitSlop={8}><AppText variant="label" color={colors.accent}>See more</AppText></Pressable>
          </View>
          <TrendingRow
            event={trendingEvent}
            carousel={feed.carousel}
            posts={feed.trendingPosts}
            onOpenEvent={(ev) => (ev.demo ? navigation.navigate('DailyPulse') : navigation.navigate('ListingDetail', { item: ev }))}
            onOpenPost={(p) => openPlace(p.place)}
          />
        </View>
      ) : null}

      {isForYou && (feed.friendsPost || activityRows.length > 0) ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="title" style={styles.sectionTitle}>Friends activity</AppText>
            <Pressable onPress={() => navigation.navigate('Activity')} hitSlop={8}>
              <AppText variant="label" color={colors.accent2}>See all</AppText>
            </Pressable>
          </View>
          {feed.friendsPost ? (
            <FriendsActivityCard post={feed.friendsPost} onOpenProfile={onOpenActor} onOpenPost={(p) => openPlace(p.place)} />
          ) : (
            activityRows.slice(0, 3).map((a) => (
              <ActivityRow key={a.id} activity={a} onOpen={onOpenActivity} onOpenActor={onOpenActor} />
            ))
          )}
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
        viewabilityConfigCallbackPairs={dwellPairs}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      {/* Create — the floating action button opens the create menu. */}
      <Pressable
        style={styles.fab}
        onPress={() => (userId ? setCreateOpen(true) : navigation.navigate('SignIn'))}
        accessibilityLabel="Create"
      >
        <Icon name="plus" size={26} color={colors.onAccent} />
      </Pressable>

      <CreateMenuSheet visible={createOpen} onClose={() => setCreateOpen(false)} onSelect={onCreateSelect} />
      <StoryViewer
        stories={openStories ?? []}
        index={openStories ? 0 : null}
        onClose={() => setOpenStories(null)}
        likedIds={storyLikes}
        onToggleLike={onToggleStoryLike}
        onReply={onStoryReply}
      />
      <PostCommentsSheet
        visible={!!commentPost}
        post={commentPost}
        userId={userId}
        onClose={() => setCommentPost(null)}
        onRequireAuth={() => navigation.navigate('SignIn')}
      />
      <ReportModal
        visible={!!reportPost}
        target={reportPost ? { type: 'post', id: reportPost.id } : null}
        userId={userId}
        market={market}
        onClose={() => setReportPost(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  listContent: { paddingTop: space.sm },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, marginBottom: space.md },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  title: { fontSize: 30, lineHeight: 34 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconRound: { minWidth: 42, height: 42, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  searchRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.base, marginBottom: space.md },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  filterBtn: { width: 48, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

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
