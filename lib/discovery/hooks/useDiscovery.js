import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKey } from '../query';
import { fetchDiscoverPage } from '../repositories/discoveryRepository';

// The React <-> discovery bridge. Give it a DiscoveryQuery, get back a paginated,
// cached, deduped result via TanStack Query. UI never calls the repository or the
// RPC directly — it uses this hook (and the flattened `items` it exposes).
export function useDiscovery(query, options = {}) {
  const key = useMemo(() => queryKey(query), [query]);

  const result = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchDiscoverPage(query, pageParam ?? null),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!query?.market && (options.enabled ?? true),
    staleTime: options.staleTime ?? 60_000,
  });

  // Flatten pages into one list for the UI; keep the paging controls handy.
  const items = useMemo(
    () => (result.data?.pages ?? []).flatMap((p) => p.items),
    [result.data],
  );

  return {
    items,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
    isRefetching: result.isRefetching,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: !!result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  };
}
