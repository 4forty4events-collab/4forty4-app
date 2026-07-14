import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  followUser, unfollowUser, getFollowStats, getActivityFeed, getFollowList, getPublicProfile,
} from './socialRepository';
import { fetchMomentPosts, createPost, deletePost } from './postsRepository';

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
