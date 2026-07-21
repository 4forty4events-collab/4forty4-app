import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { recordPostViews } from './postsRepository';

// Measures how long each feed post sits in the viewport and records it as dwell
// (watch time) so the ranker can favour content people actually linger on.
//
// Wire the returned pairs into a FlatList: `viewabilityConfigCallbackPairs={pairs}`.
// Only real moments (source 'post', which have a posts row) are tracked; everything
// else is ignored. Events are queued and flushed in batches (and on background /
// unmount) to keep writes cheap.

const MIN_DWELL_MS = 1000;    // ignore quick scroll-bys — not a real "view"
const COMPLETE_MS = 3000;     // past this, the viewer "really looked" (completed)
const MAX_DWELL_MS = 60000;   // clamp a post left on screen (tab away) so it can't skew avgs
const FLUSH_EVERY_MS = 12000;

export function useDwellTracker({ userId, market }) {
  const ctx = useRef({ userId, market });
  ctx.current = { userId, market };
  const since = useRef(new Map()); // postId -> timestamp it became visible
  const queue = useRef([]);        // pending { postId, dwellMs, completed }

  const enqueue = (postId, dwellMs) => {
    if (dwellMs < MIN_DWELL_MS) return;
    queue.current.push({ postId, dwellMs: Math.min(dwellMs, MAX_DWELL_MS), completed: dwellMs >= COMPLETE_MS });
  };

  const flush = () => {
    const { userId: uid, market: mk } = ctx.current;
    if (!uid || queue.current.length === 0) return;
    const rows = queue.current;
    queue.current = [];
    recordPostViews(uid, rows, mk).catch(() => {}); // best-effort; dwell is non-critical
  };

  useEffect(() => {
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') flush(); });
    return () => {
      clearInterval(timer);
      sub.remove();
      // Finalize anything still on screen at teardown, then flush the last batch.
      const now = Date.now();
      for (const [postId, ts] of since.current) enqueue(postId, now - ts);
      since.current.clear();
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable across renders — RN rejects a changing viewabilityConfigCallbackPairs.
  const pairs = useMemo(() => ([{
    viewabilityConfig: { itemVisiblePercentThreshold: 60, minimumViewTime: 200 },
    onViewableItemsChanged: ({ changed }) => {
      const now = Date.now();
      for (const c of changed) {
        const it = c.item;
        if (!it || it.source !== 'post') continue; // only moments have a posts row to reference
        const key = it.id;
        if (c.isViewable) {
          if (!since.current.has(key)) since.current.set(key, now);
        } else if (since.current.has(key)) {
          enqueue(key, now - since.current.get(key));
          since.current.delete(key);
        }
      }
    },
  }]), []);

  return pairs;
}
