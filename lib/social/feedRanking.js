import { experienceTier, resolveExperience } from './experiences';

// Feed ranking for the Explorer Network.
//
// The editorial premise: the feed answers "what's happening around me RIGHT NOW". So
// liveness is a HARD TIER above engagement — a verified live post from a stranger
// outranks a popular memory, always. Engagement only decides the order WITHIN a tier.
// If engagement could promote across tiers, a good photo from last month would push the
// rooftop that's busy tonight off the screen, and the feed would quietly become Instagram.
//
// Tiers (see experiences.js): live 0 · on the way 1 · just finished 2 · memory/blueprint 3,
// each nudged half a step better when the post carries a server verification. A post's
// tier DECAYS with age, so this ordering re-sorts itself over time with no writes.
//
// Within a tier: score = (engagement + 1) * freshness * (1 + interestBoost)
//   engagement = likes*3 + comments*2 + avgDwellSeconds*0.5   (dwell: moments only)
//   freshness  = exp(-ageHours / halfLife)                    — recency decay
//   interest   = +0.5 when the post's place category is one the viewer favours
// The "+1" keeps a zero-engagement post rankable: it collapses to freshness *
// (1 + interest), i.e. the cold-start "recency + interest" fallback.

const DWELL_CAP_S = 15;   // beyond this, longer dwell doesn't keep paying (anti-outlier)

// Live content ages in minutes, not days: a half-life of 36h inside the live tier would
// leave a two-hour-old "live" post scoring nearly the same as one from five minutes ago.
const HALF_LIFE_H = { live: 1.5, on_the_way: 2, just_finished: 12, memory: 36, blueprint: 36 };

function engagementScore(p) {
  const likes = p.helpfulCount ?? 0;      // like_count (moments) / helpful (review-posts)
  const comments = p.commentCount ?? 0;
  const views = p.viewCount ?? 0;
  const avgDwellS = views > 0 ? Math.min((p.dwellMsTotal ?? 0) / views / 1000, DWELL_CAP_S) : 0;
  return likes * 3 + comments * 2 + avgDwellS * 0.5;
}

function freshness(createdAt, now, halfLifeH) {
  const ageH = Math.max(0, (now - new Date(createdAt).getTime()) / 3.6e6);
  return Math.exp(-ageH / halfLifeH);
}

// Returns a NEW array ranked best-first. Pure — no mutation, safe to memoize on inputs.
export function rankFeed(items, { interestCategories = [], now = Date.now() } = {}) {
  const interest = new Set(interestCategories);
  return items
    .map((p) => {
      const tier = experienceTier(p, now);
      const { key } = resolveExperience(p, now);
      const boost = p.place?.category && interest.has(p.place.category) ? 0.5 : 0;
      const score = (engagementScore(p) + 1) * freshness(p.createdAt, now, HALF_LIFE_H[key] ?? 36) * (1 + boost);
      return { p, tier, score };
    })
    .sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.score - a.score))
    .map((x) => x.p);
}

// The "happening now" slice, for surfaces that show only the live edge of the feed.
export function liveNow(items, now = Date.now()) {
  return items.filter((p) => {
    const { key } = resolveExperience(p, now);
    return key === 'live' || key === 'on_the_way';
  });
}
