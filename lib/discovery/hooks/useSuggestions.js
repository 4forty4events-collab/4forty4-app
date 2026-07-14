import { useQuery } from '@tanstack/react-query';
import { createQuery } from '../query';
import { fetchDiscoverPage } from '../repositories/discoveryRepository';

// Autocomplete suggestions: the top few relevance-ranked matches for the current
// term, fetched as one small page (no pagination). Tapping a suggestion opens the
// listing directly — the fast path past a full results scroll. Same `discover`
// pipeline as the results, so a suggestion always resolves to a real item.
export function useSuggestions(market, text, near) {
  const term = (text ?? '').trim();
  return useQuery({
    queryKey: ['suggest', market ?? null, term, near ? { lat: Math.round(near.lat * 1000) / 1000, lng: Math.round(near.lng * 1000) / 1000 } : null],
    queryFn: async () => {
      const page = await fetchDiscoverPage(createQuery({ market, text: term, near, sort: 'relevance', limit: 6 }), null);
      return page.items;
    },
    enabled: !!market && term.length >= 2,
    staleTime: 30_000,
  });
}
