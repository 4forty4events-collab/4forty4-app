import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../supabase';
import {
  fetchDrops, claimDrop, joinWaitlist,
  DropSoldOutError, DropNotLiveError, DropEndedError, AuthRequiredError,
} from '../../drops/dropsRepository';

// Multi-drop support for the swipeable hero carousel. `useDrops` fetches the list for a
// market (no realtime here — cheap, just seeds the pages). Each carousel page then calls
// `useDrop` with its seed row, which owns that ONE drop's 1s countdown clock, its own
// realtime channel (claimed_count / status), and the claim / remind / waitlist actions.

function derivePhase(drop, nowMs) {
  if (!drop) return null;
  const soldOut = drop.status === 'sold_out' || drop.claimedCount >= drop.allocation;
  const ended = drop.status === 'ended' || (drop.endsAt && nowMs > new Date(drop.endsAt).getTime());
  if (soldOut || ended) return 'aftermath';
  if (nowMs < new Date(drop.dropAt).getTime()) return 'teaser';
  return 'live';
}

export function useDrops(market) {
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    fetchDrops(market)
      .then((d) => { if (mounted.current) { setDrops(d); setLoading(false); } })
      .catch(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [market]);

  return { drops, loading };
}

export function useDrop(initialDrop) {
  const [drop, setDrop] = useState(initialDrop);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null); // { position }
  const [actionError, setActionError] = useState(null);
  const mounted = useRef(true);
  // Per-instance channel nonce so sibling carousel pages / other screens never collide
  // on the same realtime topic name.
  const nonce = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Reconcile if the list re-seeds this page with a fresh row.
  useEffect(() => { setDrop(initialDrop); }, [initialDrop]);

  // This page's own countdown tick — drives its teaser->live flip with no remount.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // This drop's realtime lifecycle, shared live across all viewers.
  useEffect(() => {
    if (!drop?.id) return undefined;
    const channel = supabase
      .channel(`drop:${drop.id}:${nonce}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'premium_drops', filter: `id=eq.${drop.id}` },
        (payload) => {
          const r = payload.new;
          setDrop((prev) => (prev ? {
            ...prev, claimedCount: r.claimed_count, status: r.status, soldOutAt: r.sold_out_at,
          } : prev));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [drop?.id, nonce]);

  const phase = derivePhase(drop, nowMs);
  const msRemaining = drop ? Math.max(0, new Date(drop.dropAt).getTime() - nowMs) : 0;
  const remaining = drop ? Math.max(0, drop.allocation - drop.claimedCount) : 0;

  const claim = useCallback(async () => {
    if (!drop || claiming) return;
    setActionError(null);
    setClaiming(true);
    try {
      const res = await claimDrop(drop.id);
      if (!mounted.current) return;
      setDrop((prev) => (prev ? { ...prev, claimedCount: res.claimed_count, status: res.status } : prev));
      setClaimResult({ position: res.position });
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof DropSoldOutError) setActionError('Gone — sold out. Join the priority list below.');
      else if (e instanceof DropNotLiveError) setActionError('Not open yet — hold tight.');
      else if (e instanceof DropEndedError) setActionError('This drop has closed.');
      else if (e instanceof AuthRequiredError) setActionError('Sign in to claim your spot.');
      else setActionError('Something went wrong. Try again.');
    } finally {
      if (mounted.current) setClaiming(false);
    }
  }, [drop, claiming]);

  const remind = useCallback(async () => {
    if (!drop) return false;
    try {
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return false;
      const when = new Date(drop.dropAt);
      if (when.getTime() <= Date.now()) return false;
      await Notifications.scheduleNotificationAsync({
        content: { title: 'The Drop is live', body: `${drop.title} — 44 spots. Claim now.`, data: { route: 'DailyPulse' } },
        trigger: when,
      });
      return true;
    } catch { return false; }
  }, [drop]);

  const waitlist = useCallback(async (phone) => {
    if (!drop) return false;
    try { await joinWaitlist(drop.id, phone); return true; }
    catch { return false; }
  }, [drop]);

  return { drop, phase, msRemaining, remaining, claiming, claimResult, actionError, claim, remind, waitlist };
}
