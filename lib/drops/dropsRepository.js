import { supabase } from '../supabase';

// Data layer for The 4Forty4 Drop. Reads the single most-anticipated drop for a market
// and routes claim / waitlist writes through the SECURITY DEFINER RPCs, translating the
// server's raised exceptions into typed errors the UI can react to precisely.

export class DropSoldOutError extends Error { constructor() { super('DROP_SOLD_OUT'); this.name = 'DropSoldOutError'; } }
export class DropNotLiveError extends Error { constructor() { super('DROP_NOT_LIVE'); this.name = 'DropNotLiveError'; } }
export class DropEndedError extends Error { constructor() { super('DROP_ENDED'); this.name = 'DropEndedError'; } }
export class AuthRequiredError extends Error { constructor() { super('AUTH_REQUIRED'); this.name = 'AuthRequiredError'; } }

function shapeDrop(row) {
  return {
    id: row.id,
    market: row.market,
    title: row.title ?? '',
    teaser: row.teaser ?? null,
    venueName: row.venue_name ?? null,
    category: row.category ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    dropAt: row.drop_at,
    endsAt: row.ends_at ?? null,
    allocation: row.allocation ?? 44,
    claimedCount: row.claimed_count ?? 0,
    status: row.status ?? 'teaser',
    soldOutAt: row.sold_out_at ?? null,
  };
}

// Carousel ordering priority: live & still-claimable first, then upcoming teasers, then
// sold-out (aftermath) last — so a sold-out drop never leads over a live one. Computed
// once at fetch so the order stays stable (cards don't reshuffle mid-swipe as the clock
// ticks); each card still updates its own meter/phase live via realtime.
function dropRank(d, nowMs) {
  const soldOut = d.status === 'sold_out' || d.claimedCount >= d.allocation;
  if (soldOut) return 2;
  if (nowMs >= new Date(d.dropAt).getTime()) return 0; // live & open
  return 1; // upcoming teaser
}

// All still-open drops for a market, priority-ordered. `ended` ones drop off. The carousel
// renders each as its own page; each page then subscribes to its own realtime lifecycle.
export async function fetchDrops(market) {
  if (!market) return [];
  const { data, error } = await supabase
    .from('premium_drops')
    .select('*')
    .eq('market', market)
    .neq('status', 'ended')
    .order('drop_at', { ascending: true });
  if (error) throw error;
  const nowMs = Date.now();
  return (data ?? []).map(shapeDrop).sort((a, b) => {
    const ra = dropRank(a, nowMs);
    const rb = dropRank(b, nowMs);
    if (ra !== rb) return ra - rb;
    return new Date(a.dropAt).getTime() - new Date(b.dropAt).getTime();
  });
}

function classify(error) {
  const m = error?.message || '';
  if (m.includes('DROP_SOLD_OUT')) return new DropSoldOutError();
  if (m.includes('DROP_NOT_LIVE')) return new DropNotLiveError();
  if (m.includes('DROP_ENDED')) return new DropEndedError();
  if (m.includes('AUTH_REQUIRED')) return new AuthRequiredError();
  return error;
}

// Fire the claim. Returns { claimed_count, allocation, status, position } on success.
export async function claimDrop(dropId) {
  const { data, error } = await supabase.rpc('claim_drop', { p_drop_id: dropId });
  if (error) throw classify(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function joinWaitlist(dropId, phone) {
  const { error } = await supabase.rpc('join_drop_waitlist', { p_drop_id: dropId, p_phone: phone });
  if (error) {
    if ((error.message || '').includes('INVALID_PHONE')) throw new Error('INVALID_PHONE');
    throw error;
  }
}

// ── Admin authoring ──────────────────────────────────────────────────────────────────
// Every drop in the market, newest drop_at first — the admin list (includes ended ones).
export async function fetchAllDrops() {
  const { data, error } = await supabase
    .from('premium_drops')
    .select('*')
    .order('drop_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(shapeDrop);
}

export async function createDrop(input) {
  const { data, error } = await supabase.rpc('create_drop', {
    p_market: input.market,
    p_title: input.title,
    p_teaser: input.teaser ?? null,
    p_venue_name: input.venueName ?? null,
    p_category: input.category ?? null,
    p_cover_image_url: input.coverImageUrl ?? null,
    p_drop_at: input.dropAt,
    p_ends_at: input.endsAt ?? null,
    p_allocation: input.allocation ?? 44,
  });
  if (error) {
    const m = error.message || '';
    if (m.includes('NOT_ADMIN')) throw new Error('NOT_ADMIN');
    if (m.includes('TITLE_REQUIRED')) throw new Error('TITLE_REQUIRED');
    if (m.includes('DROP_AT_REQUIRED')) throw new Error('DROP_AT_REQUIRED');
    if (m.includes('BAD_ALLOCATION')) throw new Error('BAD_ALLOCATION');
    throw error;
  }
  return data; // new drop id
}

export async function deleteDrop(id) {
  const { error } = await supabase.rpc('delete_drop', { p_id: id });
  if (error) throw error;
}
