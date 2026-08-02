import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  followUser, unfollowUser, getFollowStats, getActivityFeed, getFollowList, getPublicProfile,
  fetchActiveTravelers,
} from './socialRepository';
import {
  fetchMomentPosts, createPost, deletePost, fetchLivePulse,
  fetchPostComments, addPostComment, deletePostComment,
} from './postsRepository';
import { fetchActiveStories, createStory } from './storiesRepository';
import { fetchPassport } from './passportRepository';
import { fetchThread, sendMessage, markThreadRead, fetchConversations } from './messagesRepository';

// User moments (real posts) for the Feed, per market.
export function useMomentPosts(market) {
  return useQuery({
    queryKey: ['momentPosts', market],
    queryFn: () => fetchMomentPosts({ market }),
    enabled: !!market,
    staleTime: 20_000,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['momentPosts'] });
      qc.invalidateQueries({ queryKey: ['livePulse'] }); // a live post changes the city's count
      qc.invalidateQueries({ queryKey: ['passport'] });  // a verified one changes the passport
    },
  });
}

// The Passport for any user — also how the viewer learns their own unlock state
// (Explorer Chat / groups / meetups), since the ladder lives in the same RPC.
//
// retry:false because both this and the pulse below are ADDITIVE panels: if the RPC
// isn't there yet, the component renders nothing and the screen around it still works.
// Retrying three times would only produce three identical console errors on a screen
// that is already behaving correctly.
export function usePassport(userId) {
  return useQuery({
    queryKey: ['passport', userId ?? null],
    queryFn: () => fetchPassport(userId),
    enabled: !!userId,
    staleTime: 60_000,
    retry: false,
  });
}

// "Live Around You" — refetches on a short interval because the whole promise of the
// panel is that the number is current. Only while the screen is focused: a background
// poll on a feed nobody is looking at is just battery.
export function useLivePulse({ market, coords } = {}) {
  return useQuery({
    queryKey: ['livePulse', market ?? null, coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : null],
    queryFn: () => fetchLivePulse({ market, coords }),
    enabled: !!market,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePost,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['momentPosts'] }),
  });
}

export function usePostComments(postId) {
  return useQuery({
    queryKey: ['postComments', postId],
    queryFn: () => fetchPostComments(postId),
    enabled: !!postId,
    staleTime: 15_000,
  });
}

export function useAddComment(postId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }) => addPostComment(userId, postId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['postComments', postId] });
      qc.invalidateQueries({ queryKey: ['momentPosts'] }); // comment_count changed
    },
  });
}

export function useDeleteComment(postId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId) => deletePostComment(commentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['postComments', postId] });
      qc.invalidateQueries({ queryKey: ['momentPosts'] });
    },
  });
}

// Active (non-expired) stories for the tray, grouped per author. Excludes the
// viewer's own (they see "Your story" separately). Short staleTime so a freshly
// posted story shows up on the next open.
export function useActiveStories(market, viewerId) {
  return useQuery({
    queryKey: ['activeStories', market ?? null, viewerId ?? null],
    queryFn: () => fetchActiveStories({ market, excludeUserId: viewerId }),
    enabled: !!market,
    staleTime: 30_000,
  });
}

// Post an ephemeral story (writes to `stories`, NOT `posts`), then refresh the tray.
export function useCreateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createStory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activeStories'] }),
  });
}

// The viewer's list of 1:1 conversations (DMs list). Polls lightly so new threads +
// unread counts stay fresh.
export function useConversations(meId) {
  return useQuery({
    queryKey: ['conversations', meId ?? null],
    queryFn: () => fetchConversations(meId),
    enabled: !!meId,
    refetchInterval: 15000,
  });
}

// A 1:1 DM thread. Polls while open (lightweight "realtime"); marking-read is a
// separate call the screen fires on focus.
export function useThread(meId, otherId) {
  return useQuery({
    queryKey: ['dmThread', meId ?? null, otherId ?? null],
    queryFn: () => fetchThread(meId, otherId),
    enabled: !!meId && !!otherId,
    refetchInterval: 8000,
  });
}

export function useSendMessage(meId, otherId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, storyId, postId }) => sendMessage({ senderId: meId, recipientId: otherId, body, storyId, postId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dmThread', meId ?? null, otherId ?? null] }),
  });
}

export function useMarkThreadRead() {
  return useMutation({ mutationFn: ({ meId, otherId }) => markThreadRead(meId, otherId) });
}

export function useFollowStats(userId) {
  return useQuery({
    queryKey: ['followStats', userId ?? null],
    queryFn: () => getFollowStats(userId),
    enabled: !!userId,
    staleTime: 20_000,
  });
}

export function usePublicProfile(userId) {
  return useQuery({
    queryKey: ['publicProfile', userId ?? null],
    queryFn: () => getPublicProfile(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useFollowList(userId, mode) {
  return useQuery({
    queryKey: ['followList', userId ?? null, mode],
    queryFn: () => getFollowList(userId, mode),
    enabled: !!userId && !!mode,
    staleTime: 20_000,
  });
}

// Follow / unfollow, optimistic-friendly: invalidates the target's stats and the
// viewer's activity feed (a new follow surfaces there).
export function useToggleFollow(viewerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetId, follow }) => {
      if (follow) await followUser(viewerId, targetId);
      else await unfollowUser(viewerId, targetId);
      return { targetId, follow };
    },
    onSuccess: ({ targetId }) => {
      qc.invalidateQueries({ queryKey: ['followStats', targetId] });
      qc.invalidateQueries({ queryKey: ['followStats', viewerId] });
      qc.invalidateQueries({ queryKey: ['activityFeed'] });
    },
  });
}

// Recently-active travelers in the market — powers the Discover "Travelers Nearby" row.
export function useActiveTravelers(market, viewerId) {
  return useQuery({
    queryKey: ['activeTravelers', market ?? null, viewerId ?? null],
    queryFn: () => fetchActiveTravelers(market, viewerId),
    enabled: !!market,
    staleTime: 30_000,
  });
}

export function useActivityFeed(enabled = true) {
  return useInfiniteQuery({
    queryKey: ['activityFeed'],
    queryFn: ({ pageParam }) => getActivityFeed({ before: pageParam ?? null }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 15_000,
  });
}
