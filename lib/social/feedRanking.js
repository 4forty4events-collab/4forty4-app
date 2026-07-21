// "Recommended for You" ranking. Runs over the BLENDED feed (real moments +
// review-posts) so one score orders the whole list.
//
// Spec: (1) engagement first — higher like counts + high watch/dwell time; then
// (2) cold-start fallback — newer posts, nudged by the viewer's category interest.
//
// Score = (engagement + 1) * freshness * (1 + interestBoost)
//   engagement = likes*3 + comments*2 + avgDwellSeconds*0.5   (dwell: moments only)
//   freshness  = exp(-ageHours / HALF_LIFE_H)                 — recency decay
//   interest   = +0.5 when the post's place category is one the viewer favours
// The "+1" keeps a zero-engagement post rankable: it collapses to freshness *
// (1 + interest), i.e. exactly the cold-start "recency + interest" fallback.

const HALF_LIFE_H = 36;   // a post at 36h old scores ~0.37x its fresh engagement
const DWELL_CAP_S = 15;   // beyond this, longer dwell doesn't keep paying (anti-outlier)

function engagementScore(p) {
  const likes = p.helpfulCount ?? 0;      // like_count (moments) / helpful (review-posts)
  const comments = p.commentCount ?? 0;
  const views = p.viewCount ?? 0;
  const avgDwellS = views > 0 ? Math.min((p.dwellMsTotal ?? 0) / views / 1000, DWELL_CAP_S) : 0;
  return likes * 3 + comments * 2 + avgDwellS * 0.5;
}

function freshness(createdAt, now) {
  const ageH = Math.max(0, (now - new Date(createdAt).getTime()) / 3.6e6);
  return Math.exp(-ageH / HALF_LIFE_H);
}

// Returns a NEW array ranked best-first. Pure — no mutation, safe to memoize on inputs.
export function rankFeed(items, { interestCategories = [], now = Date.now() } = {}) {
  const interest = new Set(interestCategories);
  return items
    .map((p) => {
      const boost = p.place?.category && interest.has(p.place.category) ? 0.5 : 0;
      const score = (engagementScore(p) + 1) * freshness(p.createdAt, now) * (1 + boost);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
