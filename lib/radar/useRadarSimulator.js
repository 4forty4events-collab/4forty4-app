import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useSession } from '../../providers/SessionProvider';
import { supabase } from '../supabase';
import { RADAR_SIM_ENABLED, RADAR_RADIUS_M, RADAR_PING_INTERVAL_MS } from './radarConfig';

// LOCAL foreground simulation of the Radar proximity engine — the test harness for
// the whole pipeline while background push tasks and paid maps infra aren't live.
//
// Gated HARD: only runs when RADAR_SIM_ENABLED is flipped AND the signed-in user is
// an admin — so the shipped, flag-locked build never activates it. When active it
// watches the device's foreground location, throttles pings into the
// evaluate_radar_proximity RPC (which matches + dedupes + queues push-ready
// notifications server-side), and pops a LOCAL notification per fresh alert so the
// end-to-end engine is verifiable on-device with zero paid infrastructure. In
// production the same RPC output is delivered as real push via radar-scan ->
// deliver-push; this hook is purely the free foreground tester.
export function useRadarSimulator() {
  const { session, profile } = useSession();
  const userId = session?.user?.id ?? null;
  const active = RADAR_SIM_ENABLED && !!userId && !!profile?.is_admin;

  const lastPing = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!active) return undefined;
    let sub = null;
    let cancelled = false;

    const evaluate = async (lat, lng) => {
      const now = Date.now();
      if (busy.current || now - lastPing.current < RADAR_PING_INTERVAL_MS) return;
      lastPing.current = now;
      busy.current = true;
      try {
        const { data, error } = await supabase.rpc('evaluate_radar_proximity', {
          p_user_id: userId, p_lat: lat, p_lng: lng, p_radius_m: RADAR_RADIUS_M,
        });
        if (error) { console.warn('[Radar] evaluate error:', error.message); return; }
        const alerts = Array.isArray(data) ? data : [];
        for (const a of alerts) {
          // Immediate on-device feedback (production sends the real push separately).
          await Notifications.scheduleNotificationAsync({
            content: {
              title: a.alert_title ?? '👑 4Forty4 Radar',
              body: a.alert_body ?? '',
              data: { kind: a.kind, id: a.target_id, source: 'radar' },
            },
            trigger: null,
          }).catch(() => {});
        }
        if (alerts.length) console.log(`[Radar] ${alerts.length} alert(s):`, alerts.map((a) => a.name));
      } finally {
        busy.current = false;
      }
    };

    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted' || cancelled) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: RADAR_PING_INTERVAL_MS, distanceInterval: 20 },
          (pos) => { evaluate(pos.coords.latitude, pos.coords.longitude); },
        );
        if (cancelled && sub) { sub.remove(); sub = null; }
      } catch (e) {
        console.warn('[Radar] watch failed:', e?.message ?? e);
      }
    })();

    return () => { cancelled = true; if (sub) sub.remove(); };
  }, [active, userId]);
}
