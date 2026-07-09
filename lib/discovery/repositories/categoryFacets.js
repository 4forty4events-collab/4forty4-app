import { supabase } from '../../supabase';
import { HIDDEN_CATEGORIES } from '../../categories';

// Category facets = the categories that ACTUALLY have live listings in a market,
// with counts, so the browse rail reflects real data instead of a hardcoded list.
// The population mirrors what `discover` shows (venues with is_stub = false; events
// still upcoming), so a chip never opens an empty result. Junk/reject categories
// (HIDDEN_CATEGORIES) are dropped entirely, and anything below `floor` is dropped so
// a chip always leads somewhere worth browsing. As curation adds venues, thin
// categories cross the floor and their chips appear automatically — no list to edit.
export async function fetchCategoryFacets(market, { floor = 3 } = {}) {
  const nowIso = new Date().toISOString();
  const [venues, events] = await Promise.all([
    supabase.from('venues').select('category').eq('market', market).eq('is_stub', false),
    supabase.from('events').select('category').eq('market', market).gte('start_time', nowIso),
  ]);
  if (venues.error) throw venues.error;
  if (events.error) throw events.error;

  const counts = new Map();
  for (const row of [...(venues.data ?? []), ...(events.data ?? [])]) {
    const cat = row.category;
    if (!cat || HIDDEN_CATEGORIES.includes(cat)) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= floor)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));
}
