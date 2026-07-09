import { useQuery } from '@tanstack/react-query';
import { fetchCategoryFacets } from '../repositories/categoryFacets';

// The real-data category rail. Returns [{ category, count }] — categories with at
// least `floor` live listings in the market, fullest first. Cached longer than the
// feed (the catalog shifts slowly), so the chips don't refetch on every visit.
export function useCategoryFacets(market, { floor = 3 } = {}) {
  return useQuery({
    queryKey: ['category-facets', market, floor],
    queryFn: () => fetchCategoryFacets(market, { floor }),
    enabled: !!market,
    staleTime: 5 * 60_000,
  });
}
