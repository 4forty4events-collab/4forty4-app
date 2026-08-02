import { supabase } from '../supabase';

// User "moments" — real user-generated posts. Read-side mirrors community's fetchFeedPosts
// (no fragile embeds: authors + places resolved in small follow-up `in(...)` queries), and
// emits the same shape PostCard renders — with `source: 'post'` + `ownerId` so the Feed can
// route likes/delete differently from review-posts.

async function authorMap(userIds) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('id, full_name, avatar_url, trust_tier').in('id', ids);
  if (error) throw error;
  const map = new Map();
  (data ?? []).forEach((p) => map.set(p.id, { id: p.id, name: p.full_name ?? null, avatarUrl: p.avatar_url ?? null, trustTier: p.trust_tier ?? 'standard' }));
  return map;
}

async function placeMap(rows) {
  const venueIds = rows.filter((r) => r.venue_id).map((r) => r.venue_id);
  const eventIds = rows.filter((r) => r.event_id).map((r) => r.event_id);
  const [vRes, eRes] = await Promise.all([
    venueIds.length ? supabase.from('venues').select('id, name, city, category').in('id', venueIds) : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from('events').select('id, title, category').in('id', eventIds) : Promise.resolve({ data: [] }),
  ]);
  const map = new Map();
  (vRes.data ?? []).forEach((v) => map.set(`venue-${v.id}`, { kind: 'venue', id: v.id, name: v.name, city: v.city ?? null, category: v.category ?? null }));
  (eRes.data ?? []).forEach((e) => map.set(`event-${e.id}`, { kind: 'event', id: e.id, name: e.title, city: null, category: e.category ?? null }));
  return map;
}

export async function fetchMomentPosts({ market, limit = 30 } = {}) {
  let q = supabase.from('posts').select('*').eq('status', 'published')
    .order('created_at', { ascending: false }).limit(limit);
  if (market) q = q.or(`market.eq.${market},market.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];

  const [authors, places] = await Promise.all([authorMap(rows.map((r) => r.user_id)), placeMap(rows)]);
  return rows.map((r) => ({
    source: 'post',
    id: r.id,
    ownerId: r.user_id,
    author: authors.get(r.user_id) ?? { id: r.user_id, name: null, avatarUrl: null, trustTier: 'standard' },
    place: r.venue_id || r.event_id ? (places.get(r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`) ?? null) : null,
    rating: null,
    body: (r.body ?? '').trim() || null,
    photoUrls: Array.isArray(r.photo_urls) ? r.photo_urls.filter((u) => u && String(u).trim()) : [],
    // Experience model (Stage 5A). `verification` is server-written and read-only here;
    // see lib/social/experiences.js for how these decay into an effective state.
    experienceType: r.experience_type ?? 'memory',
    verification: r.verification ?? 'unverified',
    verifiedAt: r.verified_at ?? null,
    placeLabel: r.place_label ?? null,
    tripId: r.trip_id ?? null,
    helpfulCount: r.like_count ?? 0,   // PostCard reads helpfulCount as the like count
    commentCount: r.comment_count ?? 0,
    // Dwell rollups (Stage 3) feed the engagement ranker; absent on review-posts.
    viewCount: r.view_count ?? 0,
    dwellMsTotal: r.dwell_ms_total ?? 0,
    createdAt: r.created_at,
  }));
}

// Record a batch of dwell/view events (Stage 3). Each row is { postId, dwellMs,
// completed }; a trigger rolls them up onto posts.view_count / dwell_ms_total. Silent
// no-op for guests (RLS requires auth.uid() = user_id).
export async function recordPostViews(userId, rows, market) {
  if (!userId || !rows?.length) return;
  const payload = rows.map((r) => ({
    post_id: r.postId,
    user_id: userId,
    dwell_ms: Math.round(r.dwellMs ?? 0),
    completed: !!r.completed,
    market: market ?? null,
  }));
  const { error } = await supabase.from('content_views').insert(payload);
  if (error) throw error;
}

// Create an experience post. Always goes through create_experience_post rather than a
// direct insert, because verification is a SERVER verdict: we hand over the coordinates
// so the RPC can measure the distance to the tagged place, and it stores only the result
// (verified / not) plus a friendly label — never the coordinates themselves.
//
// A 'live' claim that doesn't check out comes back as a 'memory'. That's deliberate:
// the green badge is only worth something if it can't be faked from the client.
export async function createPost({ body, photoUrls, place, market, experienceType = 'memory', coords = null, tripId = null }) {
  const { data, error } = await supabase.rpc('create_experience_post', {
    p_type: experienceType,
    p_body: body?.trim() || null,
    p_photo_urls: photoUrls ?? [],
    p_venue: place?.kind === 'venue' ? place.id : null,
    p_event: place?.kind === 'event' ? place.id : null,
    p_market: market ?? null,
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
    p_trip: tripId,
  });
  if (error) throw error;
  // The verdict, not just an id — the composer surfaces it when a live claim was
  // stored as a memory instead.
  return {
    id: data?.id ?? null,
    experienceType: data?.experience_type ?? experienceType,
    verification: data?.verification ?? 'unverified',
  };
}

// The city's heartbeat: per-category counts of what's happening right now. Returns
// { total, rows: [{ category, n }] } — an empty pulse is a real answer, not an error.
export async function fetchLivePulse({ market, coords, radiusM = 25000, windowMins = 180 } = {}) {
  const { data, error } = await supabase.rpc('live_pulse', {
    p_market: market ?? null,
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
    p_radius_m: radiusM,
    p_window_mins: windowMins,
  });
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({ category: r.category, n: Number(r.n) || 0 }));
  return { total: rows.reduce((s, r) => s + r.n, 0), rows };
}

export async function deletePost(postId) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function setPostLike(userId, postId, on) {
  if (on) {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    if (error && error.code !== '23505') throw error; // ignore duplicate
  } else {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  }
}

export async function fetchMyPostLikes(userId, postIds) {
  if (!userId || !postIds?.length) return new Set();
  const { data, error } = await supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id));
}

// ---- comments --------------------------------------------------------------
export async function fetchPostComments(postId) {
  const { data, error } = await supabase.from('post_comments')
    .select('*').eq('post_id', postId).order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const authors = await authorMap(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    author: authors.get(r.user_id) ?? { id: r.user_id, name: null, avatarUrl: null, trustTier: 'standard' },
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addPostComment(userId, postId, body) {
  const { data, error } = await supabase.from('post_comments')
    .insert({ post_id: postId, user_id: userId, body: body.trim() }).select('id').single();
  if (error) throw error;
  return data;
}

export async function deletePostComment(commentId) {
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}
