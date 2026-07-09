import { supabase } from '../../supabase';
import { normalizeVenue } from '../../feed';

// Data-access boundary for personalized recommendations (the `recommend_for_user`
// RPC). Same page shape as the discovery repository — { items, nextCursor } —
// so it flows through the same infinite-query machinery. Recommendations are
// venues (places you'd like); the RPC uses auth.uid() so it's always the
// caller's own.
export async function fetchForYouPage(context, cursor = null) {
  const limit = context.limit ?? 12;
  const { data, error } = await supabase.rpc('recommend_for_user', {
    p_market: context.market,
    p_cursor: cursor ?? null,
    p_limit: limit,
  });
  if (error) throw error;

  const rows = data ?? [];
  const items = rows.map((row) => normalizeVenue(row.item));
  const last = rows.length ? rows[rows.length - 1] : null;
  const nextCursor = rows.length < limit || !last ? null : { v: last.sort_v, id: last.out_id };
  return { items, nextCursor };
}
