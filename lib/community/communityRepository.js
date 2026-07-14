import { supabase } from '../supabase';

// Community Hub data-access layer. Framework-agnostic: plain async functions,
// camelCase domain objects, the only place that knows the community table shapes.
// A "target" is { kind: 'venue' | 'event', id }. Author display comes from the
// public_profiles view (id/name/avatar only — never private profile fields).

// ---- helpers ---------------------------------------------------------------
function targetCols(target) {
  return {
    venue_id: target.kind === 'venue' ? target.id : null,
    event_id: target.kind === 'event' ? target.id : null,
  };
}

function applyTarget(query, target) {
  return target.kind === 'venue' ? query.eq('venue_id', target.id) : query.eq('event_id', target.id);
}

// Fetch author display info for a set of user ids -> Map(id -> {id,name,avatarUrl}).
async function authorMap(userIds) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('id, full_name, avatar_url, trust_tier').in('id', ids);
  if (error) throw error;
  const map = new Map();
  (data ?? []).forEach((p) => map.set(p.id, { id: p.id, name: p.full_name ?? null, avatarUrl: p.avatar_url ?? null, trustTier: p.trust_tier ?? 'standard' }));
  return map;
}

// ---- normalizers -----------------------------------------------------------
export function normalizeReview(row, authors) {
  return {
    id: row.id,
    userId: row.user_id,
    author: authors?.get(row.user_id) ?? { id: row.user_id, name: null, avatarUrl: null },
    kind: row.venue_id ? 'venue' : 'event',
    targetId: row.venue_id ?? row.event_id,
    rating: row.rating,
    title: row.title ?? null,
    body: row.body ?? null,
    photoUrls: row.photo_urls ?? [],
    videoUrls: row.video_urls ?? [],
    visitedAt: row.visited_at ?? null,
    isVerifiedVisitor: !!row.is_verified_visitor,
    helpfulCount: row.helpful_count ?? 0,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function normalizeQuestion(row, authors, answersByQuestion) {
  return {
    id: row.id,
    userId: row.user_id,
    author: authors?.get(row.user_id) ?? { id: row.user_id, name: null, avatarUrl: null },
    kind: row.venue_id ? 'venue' : 'event',
    targetId: row.venue_id ?? row.event_id,
    body: row.body,
    createdAt: row.created_at,
    answers: (answersByQuestion?.get(row.id) ?? []),
  };
}

export function normalizeAnswer(row, authors) {
  return {
    id: row.id,
    questionId: row.question_id,
    userId: row.user_id,
    author: authors?.get(row.user_id) ?? { id: row.user_id, name: null, avatarUrl: null },
    body: row.body,
    isOfficial: !!row.is_official,
    createdAt: row.created_at,
  };
}

// ---- reviews ---------------------------------------------------------------
export async function fetchReviews(target, { sort = 'helpful', limit = 20 } = {}) {
  let q = supabase.from('reviews').select('*').eq('status', 'published');
  q = applyTarget(q, target);
  q = sort === 'recent'
    ? q.order('created_at', { ascending: false })
    : q.order('helpful_count', { ascending: false }).order('created_at', { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) throw error;

  const authors = await authorMap((data ?? []).map((r) => r.user_id));
  return (data ?? []).map((r) => normalizeReview(r, authors));
}

export async function getMyReview(userId, target) {
  if (!userId) return null;
  let q = supabase.from('reviews').select('*').eq('user_id', userId);
  q = applyTarget(q, target);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? normalizeReview(data) : null;
}

export async function createReview(userId, target, { rating, title, body, photoUrls, videoUrls, visitedAt, market }) {
  const { data, error } = await supabase.from('reviews').insert({
    user_id: userId,
    ...targetCols(target),
    rating,
    title: title?.trim() || null,
    body: body?.trim() || null,
    photo_urls: photoUrls ?? [],
    video_urls: videoUrls ?? [],
    visited_at: visitedAt ?? null,
    market: market ?? null,
  }).select('*').single();
  if (error) throw error;
  return normalizeReview(data);
}

export async function updateReview(reviewId, patch) {
  const row = {};
  if ('rating' in patch) row.rating = patch.rating;
  if ('title' in patch) row.title = patch.title?.trim() || null;
  if ('body' in patch) row.body = patch.body?.trim() || null;
  if ('photoUrls' in patch) row.photo_urls = patch.photoUrls ?? [];
  if ('videoUrls' in patch) row.video_urls = patch.videoUrls ?? [];
  if ('visitedAt' in patch) row.visited_at = patch.visitedAt ?? null;
  const { data, error } = await supabase.from('reviews').update(row).eq('id', reviewId).select('*').single();
  if (error) throw error;
  return normalizeReview(data);
}

export async function deleteReview(reviewId) {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

// ---- feed (social) ---------------------------------------------------------
// The Feed tab's "moments": recent published reviews that carry a photo, treated as user
// posts. Read-only and table-free — reuses reviews + public_profiles + the place row. No
// fragile embeds: authors and places are resolved in small follow-up `in(...)` queries.
export async function fetchFeedPosts({ market, limit = 30 } = {}) {
  let q = supabase.from('reviews').select('*').eq('status', 'published')
    .order('created_at', { ascending: false }).limit(limit);
  if (market) q = q.or(`market.eq.${market},market.is.null`);
  const { data, error } = await q;
  if (error) throw error;

  const withPhotos = (data ?? []).filter(
    (r) => Array.isArray(r.photo_urls) && r.photo_urls.some((u) => u && String(u).trim()),
  );
  if (!withPhotos.length) return [];

  const authors = await authorMap(withPhotos.map((r) => r.user_id));
  const venueIds = withPhotos.filter((r) => r.venue_id).map((r) => r.venue_id);
  const eventIds = withPhotos.filter((r) => r.event_id).map((r) => r.event_id);
  const [vRes, eRes] = await Promise.all([
    venueIds.length ? supabase.from('venues').select('id, name, city, category').in('id', venueIds) : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from('events').select('id, title, category').in('id', eventIds) : Promise.resolve({ data: [] }),
  ]);
  const places = new Map();
  (vRes.data ?? []).forEach((v) => places.set(`venue-${v.id}`, { kind: 'venue', id: v.id, name: v.name, city: v.city ?? null, category: v.category ?? null }));
  (eRes.data ?? []).forEach((e) => places.set(`event-${e.id}`, { kind: 'event', id: e.id, name: e.title, city: null, category: e.category ?? null }));

  return withPhotos.map((r) => ({
    id: r.id,
    author: authors.get(r.user_id) ?? { id: r.user_id, name: null, avatarUrl: null, trustTier: 'standard' },
    place: places.get(r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`) ?? null,
    rating: r.rating ?? null,
    body: (r.body ?? r.title ?? '').trim() || null,
    photoUrls: r.photo_urls.filter((u) => u && String(u).trim()),
    helpfulCount: r.helpful_count ?? 0,
    createdAt: r.created_at,
  }));
}

// ---- helpful reactions -----------------------------------------------------
export async function setHelpful(userId, reviewId, on) {
  if (on) {
    const { error } = await supabase.from('review_reactions')
      .insert({ user_id: userId, review_id: reviewId, type: 'helpful' });
    if (error && error.code !== '23505') throw error; // ignore duplicate
  } else {
    const { error } = await supabase.from('review_reactions')
      .delete().eq('user_id', userId).eq('review_id', reviewId).eq('type', 'helpful');
    if (error) throw error;
  }
}

// Which of the given reviews the user has marked helpful -> Set of review ids.
export async function fetchMyHelpful(userId, reviewIds) {
  if (!userId || !reviewIds?.length) return new Set();
  const { data, error } = await supabase.from('review_reactions')
    .select('review_id').eq('user_id', userId).eq('type', 'helpful').in('review_id', reviewIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.review_id));
}

// ---- questions & answers ---------------------------------------------------
export async function fetchQuestions(target, { limit = 20 } = {}) {
  let q = supabase.from('questions').select('*').eq('status', 'published');
  q = applyTarget(q, target);
  const { data: questions, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  if (!questions?.length) return [];

  const { data: answers, error: aErr } = await supabase.from('answers')
    .select('*').in('question_id', questions.map((x) => x.id)).order('created_at', { ascending: true });
  if (aErr) throw aErr;

  const authors = await authorMap([
    ...questions.map((x) => x.user_id),
    ...(answers ?? []).map((x) => x.user_id),
  ]);
  const answersByQuestion = new Map();
  (answers ?? []).forEach((a) => {
    const list = answersByQuestion.get(a.question_id) ?? [];
    list.push(normalizeAnswer(a, authors));
    answersByQuestion.set(a.question_id, list);
  });
  return questions.map((x) => normalizeQuestion(x, authors, answersByQuestion));
}

export async function askQuestion(userId, target, body, market = null) {
  const { data, error } = await supabase.from('questions').insert({
    user_id: userId, ...targetCols(target), body: body.trim(), market,
  }).select('*').single();
  if (error) throw error;
  return normalizeQuestion(data);
}

export async function answerQuestion(userId, questionId, body, { isOfficial = false } = {}) {
  const { data, error } = await supabase.from('answers').insert({
    question_id: questionId, user_id: userId, body: body.trim(), is_official: isOfficial,
  }).select('*').single();
  if (error) throw error;
  return normalizeAnswer(data);
}

// ---- credibility -----------------------------------------------------------
export async function getCreatorStats(userId) {
  const { data, error } = await supabase.rpc('get_creator_stats', { p_user: userId });
  if (error) throw error;
  const s = data ?? {};
  return {
    reviewsWritten: s.reviews_written ?? 0,
    photosShared: s.photos_shared ?? 0,
    helpfulReceived: s.helpful_received ?? 0,
    answersGiven: s.answers_given ?? 0,
    questionsAsked: s.questions_asked ?? 0,
    verifiedVisits: s.verified_visits ?? 0,
  };
}

export async function getUserBadges(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from('user_badges')
    .select('badge, awarded_at').eq('user_id', userId).order('awarded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => ({ badge: b.badge, awardedAt: b.awarded_at }));
}
