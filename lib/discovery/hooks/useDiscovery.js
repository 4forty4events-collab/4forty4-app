import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKey } from '../query';
import { fetchDiscoverPage } from '../repositories/discoveryRepository';
import { sortImagesFirst, dedupeById } from '../../feed';

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

  // Flatten pages into one list for the UI; keep the paging controls handy. Dedupe by
  // kind+id — keyset pages can overlap at their boundary and repeat a row, which would
  // otherwise collide list keys. Image-bearing listings are then floated to the front so a
  // placeholder is never up top. This reorders DISPLAY only — paging uses each page's raw
  // cursor, untouched.
  const items = useMemo(
    () => sortImagesFirst(dedupeById((result.data?.pages ?? []).flatMap((p) => p.items))),
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
