import { supabase } from '../supabase';

// Batched enrichment for the redesigned Outings cards: a cover (the first stop's
// photo), a place count, and member avatars — all without per-outing N+1. Trips and
// budget plans keep their stops in different tables, so each gets its own batch.

async function profilesByIds(ids) {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return new Map();
  const { data } = await supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', uniq);
  const m = new Map();
  (data ?? []).forEach((p) => m.set(p.id, { id: p.id, name: p.full_name ?? null, avatarUrl: p.avatar_url ?? null }));
  return m;
}

// { [tripId]: { cover, placeCount, memberCount, members: [{ id, name, avatarUrl }] } }
// cover = the first stop's venue/event photo (drives the card's identity).
export async function enrichTrips(tripIds) {
  const ids = Array.from(new Set((tripIds ?? []).filter(Boolean)));
  if (!ids.length) return {};
  const [{ data: items }, { data: parts }] = await Promise.all([
    supabase.from('trip_items')
      .select('trip_id, sort_order, day_date, venue:venues(cover_image_url), event:events(cover_image_url)')
      .in('trip_id', ids)
      .order('day_date', { ascending: true }).order('sort_order', { ascending: true }),
    supabase.from('trip_participants').select('trip_id, user_id').in('trip_id', ids),
  ]);

  const out = {};
  ids.forEach((id) => { out[id] = { cover: null, placeCount: 0, memberCount: 0, members: [] }; });
  for (const it of items ?? []) {
    const o = out[it.trip_id]; if (!o) continue;
    o.placeCount += 1;
    if (!o.cover) o.cover = it.venue?.cover_image_url ?? it.event?.cover_image_url ?? null;
  }

  const byTrip = new Map();
  const allIds = [];
  for (const p of parts ?? []) {
    if (!byTrip.has(p.trip_id)) byTrip.set(p.trip_id, []);
    byTrip.get(p.trip_id).push(p.user_id);
    allIds.push(p.user_id);
  }
  const profiles = await profilesByIds(allIds);
  for (const [tripId, uids] of byTrip) {
    const o = out[tripId]; if (!o) continue;
    o.memberCount = uids.length;
    o.members = uids.slice(0, 4).map((u) => profiles.get(u) ?? { id: u, name: null, avatarUrl: null });
  }
  return out;
}

// { [planId]: { cover } } — the first budget item's venue/event photo.
export async function enrichPlans(planIds) {
  const ids = Array.from(new Set((planIds ?? []).filter(Boolean)));
  if (!ids.length) return {};
  const { data: items } = await supabase.from('budget_items')
    .select('plan_id, created_at, venue:venues(cover_image_url), event:events(cover_image_url)')
    .in('plan_id', ids)
    .order('created_at', { ascending: true });
  const out = {};
  ids.forEach((id) => { out[id] = { cover: null }; });
  for (const it of items ?? []) {
    const o = out[it.plan_id]; if (!o || o.cover) continue;
    o.cover = it.venue?.cover_image_url ?? it.event?.cover_image_url ?? null;
  }
  return out;
}
