import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Single source for the OS "reduce motion" setting. Feed parallax, hero scale and
// screen transitions read this and fall back to instant/no-transform when true.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduced;
}
