import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { activeStrategy } from '../services/recommendationStrategy';
import { sortImagesFirst, dedupeById } from '../../feed';

// The React bridge for personalized recommendations. Delegates paging to the
// active RecommendationStrategy, so swapping the brain never touches this hook.
// Keyed by strategy + user + market so each user's recs cache independently.
export function useForYou(context, options = {}) {
  const key = useMemo(
    () => ['forYou', activeStrategy.key, context.userId ?? null, context.market ?? null],
    [context.userId, context.market],
  );

  const result = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => activeStrategy.fetchPage(context, pageParam ?? null),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!context.market && (options.enabled ?? true),
    staleTime: options.staleTime ?? 120_000,
  });

  const items = useMemo(
    () => sortImagesFirst(dedupeById((result.data?.pages ?? []).flatMap((p) => p.items))),
    [result.data],
  );

  return {
    items,
    isLoading: result.isLoading,
    isError: result.isError,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: !!result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  };
}
