import { useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotifications, unreadCount, markRead, markAllRead, deleteNotification, clearAll,
} from './notificationRepository';

// React bindings for the notifications repository. The unread count polls lightly
// so the header badge stays live; writes invalidate both the feed and the count.

export function useUnreadCount(userId) {
  return useQuery({
    queryKey: ['notifUnread', userId ?? null],
    queryFn: unreadCount,
    enabled: !!userId,
    refetchInterval: 60_000,   // keep the badge live without hammering
    staleTime: 30_000,
  });
}

export function useNotifications(userId, { pageSize = 20 } = {}) {
  const result = useInfiniteQuery({
    queryKey: ['notifications', userId ?? null],
    queryFn: ({ pageParam }) => fetchNotifications({ limit: pageSize, offset: pageParam ?? 0 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: !!userId,
  });
  const items = useMemo(() => (result.data?.pages ?? []).flatMap((p) => p.items), [result.data]);
  return {
    items,
    isLoading: result.isLoading,
    isError: result.isError,
    refetch: result.refetch,
    isRefetching: result.isRefetching,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: !!result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  };
}

function useNotifInvalidator(userId) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['notifications', userId ?? null] });
    qc.invalidateQueries({ queryKey: ['notifUnread', userId ?? null] });
  };
}

export function useMarkRead(userId) {
  const invalidate = useNotifInvalidator(userId);
  return useMutation({ mutationFn: (id) => markRead(id), onSuccess: invalidate });
}

export function useMarkAllRead(userId) {
  const invalidate = useNotifInvalidator(userId);
  return useMutation({ mutationFn: () => markAllRead(), onSuccess: invalidate });
}

export function useDeleteNotification(userId) {
  const invalidate = useNotifInvalidator(userId);
  return useMutation({ mutationFn: (id) => deleteNotification(id), onSuccess: invalidate });
}

export function useClearAll(userId) {
  const invalidate = useNotifInvalidator(userId);
  return useMutation({ mutationFn: () => clearAll(), onSuccess: invalidate });
}
