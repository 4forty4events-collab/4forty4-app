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

export async function createPost({ userId, body, photoUrls, place, market }) {
  const { data, error } = await supabase.from('posts').insert({
    user_id: userId,
    body: body?.trim() || null,
    photo_urls: photoUrls ?? [],
    venue_id: place?.kind === 'venue' ? place.id : null,
    event_id: place?.kind === 'event' ? place.id : null,
    market: market ?? null,
  }).select('id').single();
  if (error) throw error;
  return data;
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
