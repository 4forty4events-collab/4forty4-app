import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/theme';

// Passive auto-scroll for a horizontal FlatList — a gentle, alive drift through the
// row that instantly yields to the user. Ref-driven (no state → zero re-renders, so
// several rows can glide at once cheaply). Ping-pongs at the ends so there's never a
// jarring jump-back. Honors reduce-motion (disabled) and only runs when the content
// actually overflows. It reorders NOTHING — it just scrolls whatever order the data
// arrives in (already images-first from the data hooks).
//
// Usage: const auto = useAutoScroll(listRef, { itemCount, enabled });  then
//   <FlatList ref={listRef} horizontal {...auto} ... />
const SPEED = 0.4;         // px per tick — deliberately slow/subtle
const INTERVAL = 32;       // ms  (~12px/s)
const RESUME_DELAY = 2500; // ms of stillness before it starts gliding again

export function useAutoScroll(listRef, { enabled = true, itemCount = 0 } = {}) {
  const reduced = useReducedMotion();
  const offset = useRef(0);
  const dir = useRef(1);
  const paused = useRef(false);
  const metrics = useRef({ content: 0, container: 0 });
  const resumeTimer = useRef(null);

  const active = enabled && !reduced && itemCount > 1;

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      if (paused.current) return;
      const max = metrics.current.content - metrics.current.container;
      if (max <= 4) return; // fits on screen — nothing to glide through
      let next = offset.current + SPEED * dir.current;
      if (next >= max) { next = max; dir.current = -1; }
      else if (next <= 0) { next = 0; dir.current = 1; }
      offset.current = next;
      // Works for both FlatList (scrollToOffset) and ScrollView (scrollTo).
      const ref = listRef.current;
      if (ref?.scrollToOffset) ref.scrollToOffset({ offset: next, animated: false });
      else if (ref?.scrollTo) ref.scrollTo({ x: next, animated: false });
    }, INTERVAL);
    return () => {
      clearInterval(id);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [active, listRef]);

  if (!active) return {}; // disabled → a plain static list

  const pause = () => {
    paused.current = true;
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  };
  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { paused.current = false; }, RESUME_DELAY);
  };

  return {
    // Instant kill on ANY touch (tap or the start of a swipe)...
    onTouchStart: pause,
    onScrollBeginDrag: pause,
    // ...then resume only after the user has been still for a beat.
    onTouchEnd: scheduleResume,
    onTouchCancel: scheduleResume,
    onScrollEndDrag: scheduleResume,
    onMomentumScrollEnd: scheduleResume,
    // Track the real position so a resume continues from where the user left off.
    scrollEventThrottle: 16,
    onScroll: (e) => { offset.current = e.nativeEvent.contentOffset.x; },
    onContentSizeChange: (w) => { metrics.current.content = w; },
    onLayout: (e) => { metrics.current.container = e.nativeEvent.layout.width; },
  };
}
