import { supabase } from '../supabase';

// Data-access for the social graph: follows, follow stats, the activity feed, and
// follower/following lists. The graph is public-readable (RLS), so counts and lists
// work cross-user; you can only write your OWN follow edges.

export async function followUser(followerId, followingId) {
  const { error } = await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
  if (error && error.code !== '23505') throw error; // already following
}

export async function unfollowUser(followerId, followingId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw error;
}

// { followers, following, isFollowing } for a user, from the caller's perspective.
export async function getFollowStats(userId) {
  const { data, error } = await supabase.rpc('get_follow_stats', { p_user: userId }).single();
  if (error) throw error;
  return { followers: data.followers ?? 0, following: data.following ?? 0, isFollowing: !!data.is_following };
}

// One page of the followed-users activity feed. Keyset by created_at (opaque cursor
// is the last row's timestamp).
export async function getActivityFeed({ before = null, limit = 20 } = {}) {
  const { data, error } = await supabase.rpc('get_activity_feed', { p_limit: limit, p_before: before });
  if (error) throw error;
  const rows = data ?? [];
  const nextCursor = rows.length < limit ? null : rows[rows.length - 1].created_at;
  return { rows, nextCursor };
}

// Follower or following list resolved to public profiles. Two-step (the graph FK
// points at auth.users, not the public_profiles view, so no PostgREST embed).
export async function getFollowList(userId, mode) {
  const filterCol = mode === 'followers' ? 'following_id' : 'follower_id';
  const idCol = mode === 'followers' ? 'follower_id' : 'following_id';
  const { data: rows, error } = await supabase.from('follows').select(idCol).eq(filterCol, userId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r[idCol]);
  if (!ids.length) return [];
  const { data: profs, error: pErr } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, trust_tier')
    .in('id', ids);
  if (pErr) throw pErr;
  return profs ?? [];
}

// A user's public profile card (name / avatar / trust tier).
export async function getPublicProfile(userId) {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, trust_tier')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// "Travelers nearby" — recently-active community members in the same market, derived
// from existing data (no user-location store yet): the authors of the newest published
// reviews, de-duped, minus the viewer, resolved to public profiles with follow state.
export async function fetchActiveTravelers(market, viewerId, limit = 12) {
  let q = supabase
    .from('reviews')
    .select('user_id, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(80);
  if (market) q = q.eq('market', market);
  const { data: revs, error } = await q;
  if (error) throw error;

  const ids = [...new Set((revs ?? []).map((r) => r.user_id))]
    .filter((id) => id && id !== viewerId)
    .slice(0, limit);
  if (!ids.length) return [];

  const { data: profs, error: pErr } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, trust_tier')
    .in('id', ids);
  if (pErr) throw pErr;

  let following = new Set();
  if (viewerId) {
    const { data: fol } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', viewerId)
      .in('following_id', ids);
    following = new Set((fol ?? []).map((f) => f.following_id));
  }

  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  // Preserve recency order from `ids`; drop any id without a public profile row.
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => ({ ...p, isFollowing: following.has(p.id) }));
}
