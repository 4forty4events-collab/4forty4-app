import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';
import { supabase } from '../../supabase';

// Android needs this opt-in for LayoutAnimation to run.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// NOTE ON SCHEMA: the spec's `local_events` / `is_boosted` don't exist in this repo.
// The table is `events`; the closest signal to "boosted" is `is_featured` (Editor's
// Picks), which we treat as the Spotlight/boost flag. `venues(name)` is the join.
const SELECT =
  'id, title, category, cover_image_url, start_time, end_time, market, is_featured, price, currency, venues(name)';

function shape(row) {
  return {
    id: row.id,
    title: row.title ?? '',
    category: row.category ?? null,
    imageUrl: row.cover_image_url ?? null,
    startTime: row.start_time,
    endTime: row.end_time ?? null,
    market: row.market,
    isFeatured: !!row.is_featured, // "boosted" in this schema
    price: row.price ?? null,
    currency: row.currency ?? null,
    venueName: row.venues?.name ?? null,
  };
}

// The Daily Pulse feed: upcoming local events (end_time still in the future),
// chronological, with a live Supabase realtime binding. Any promoter INSERT / UPDATE /
// DELETE on an event in this market re-pulls and gently LayoutAnimates the change in —
// so a newly boosted event floats up seamlessly with no manual refresh. The boosted
// (is_featured) event is surfaced as the Spotlight; the rest form the stream.
//
// Realtime requires `events` in the supabase_realtime publication — see the migration
// 20260710150000_events_realtime.sql. Without it the fetch still works; only the live
// push is silent.
export function useDailyPulse(market) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (animate) => {
      if (!market) return;
      const { data, error: e } = await supabase
        .from('events')
        .select(SELECT)
        .eq('market', market)
        .gt('end_time', new Date().toISOString())
        .order('start_time', { ascending: true });
      if (!mounted.current) return;
      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }
      // Animate realtime-driven changes (reorders / boosts) so they glide in.
      if (animate) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEvents((data ?? []).map(shape));
      setError(null);
      setLoading(false);
    },
    [market],
  );

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    load(false);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // One realtime channel per market; mirrors the trip-workspace subscription pattern.
  useEffect(() => {
    if (!market) return undefined;
    const channel = supabase
      .channel(`daily-pulse:${market}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `market=eq.${market}` },
        () => load(true),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [market, load]);

  // Spotlight = the boosted event, else the soonest. Stream = everything else.
  const spotlight = events.find((e) => e.isFeatured) ?? events[0] ?? null;
  const stream = spotlight ? events.filter((e) => e.id !== spotlight.id) : events;

  return { spotlight, stream, loading, error, reload: () => load(false) };
}
