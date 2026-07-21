import { supabase } from '../supabase';

// Ephemeral Stories (24h). A SEPARATE entity from feed posts — the story builder
// writes HERE, never to `posts`, so stories never appear in the Recommended feed.
// Read-side mirrors postsRepository: authors resolved via public_profiles in one
// follow-up in(...) query (no fragile embeds). RLS already hides expired rows; the
// explicit expires_at filter keeps the client honest against clock skew.

async function authorMap(userIds) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', ids);
  if (error) throw error;
  const m = new Map();
  (data ?? []).forEach((p) => m.set(p.id, { id: p.id, name: p.full_name ?? null, avatarUrl: p.avatar_url ?? null }));
  return m;
}

// Active (non-expired) stories grouped per author, most-recently-active author first.
// Each group carries its stories oldest -> newest so the viewer plays them in order.
// Shape matches what StoriesBar/StoryViewer consume: { id, name, avatarUrl, hasStory,
// stories: [{ id, storyUrl, caption, name, avatarUrl, createdAt }] }.
export async function fetchActiveStories({ market, excludeUserId } = {}) {
  let q = supabase.from('stories').select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  if (market) q = q.or(`market.eq.${market},market.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];
  if (excludeUserId) rows = rows.filter((r) => r.user_id !== excludeUserId);
  if (!rows.length) return [];

  const authors = await authorMap(rows.map((r) => r.user_id));
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.user_id)) groups.set(r.user_id, []);
    groups.get(r.user_id).push(r);
  }
  const out = [];
  for (const [uid, list] of groups) {
    const a = authors.get(uid) ?? { id: uid, name: null, avatarUrl: null };
    out.push({
      id: uid,
      name: a.name,
      avatarUrl: a.avatarUrl,
      hasStory: true,
      latestAt: list[list.length - 1].created_at,
      stories: list.map((s) => ({
        id: s.id,
        authorId: uid,          // who to DM when replying to this story
        storyUrl: s.media_url,
        caption: s.caption ?? null,
        name: a.name,
        avatarUrl: a.avatarUrl,
        createdAt: s.created_at,
      })),
    });
  }
  out.sort((x, y) => (y.latestAt > x.latestAt ? 1 : y.latestAt < x.latestAt ? -1 : 0));
  return out;
}

// Post an ephemeral story. mediaUrl is an already-hosted R2 URL (uploaded before this
// call, same as posts). expires_at is defaulted (now + 24h) by the table.
export async function createStory({ userId, mediaUrl, caption, market }) {
  const { data, error } = await supabase.from('stories').insert({
    user_id: userId,
    media_url: mediaUrl,
    caption: caption?.trim() || null,
    market: market ?? null,
  }).select('id').single();
  if (error) throw error;
  return data;
}

// Like / unlike a story (Stage 4). like_count is trigger-maintained; a trigger also
// pings the story owner. Duplicate insert (double-tap race) is ignored.
export async function setStoryLike(userId, storyId, on) {
  if (on) {
    const { error } = await supabase.from('story_likes').insert({ story_id: storyId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId);
    if (error) throw error;
  }
}

export async function fetchMyStoryLikes(userId, storyIds) {
  if (!userId || !storyIds?.length) return new Set();
  const { data, error } = await supabase.from('story_likes').select('story_id').eq('user_id', userId).in('story_id', storyIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.story_id));
}
