import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  followUser, unfollowUser, getFollowStats, getActivityFeed, getFollowList, getPublicProfile,
  fetchActiveTravelers,
} from './socialRepository';
import {
  fetchMomentPosts, createPost, deletePost,
  fetchPostComments, addPostComment, deletePostComment,
} from './postsRepository';
import { fetchActiveStories, createStory } from './storiesRepository';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['momentPosts'] }),
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
