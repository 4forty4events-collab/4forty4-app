// Tokens directly, not the theme barrel: this module is pure logic (the ranker imports
// it too), so it must not drag AppText/react-native in behind it.
import { colors } from '../theme/tokens';

// The experience model behind the Explorer Network feed.
//
// A Purday post declares WHEN it happened relative to the experience, not just that it
// happened. That declaration is what the feed ranks on, so it has to stay honest in two
// directions:
//
//   1. The server decides verification (see create_experience_post) — a client can never
//      mark its own post "Live Verified".
//   2. Badges EXPIRE. "Live now" is a claim about the present tense, so it cannot keep
//      being true an hour later. resolveExperience() decays a post's declared type as it
//      ages, which is why the feed never shows a six-hour-old post as happening now.
//
// Everything here is pure and presentation-agnostic; the ranker and the badges both read
// from resolveExperience() so they can never disagree about what a post currently is.

export const LIVE_WINDOW_MINS = 180;          // "Live now" holds for 3h, then it's past tense
export const ON_THE_WAY_WINDOW_MINS = 180;    // an unfulfilled "on my way" fades to a memory
export const JUST_FINISHED_WINDOW_MINS = 1440; // "just finished" reads as recent for a day

export const EXPERIENCE_TYPES = {
  live: {
    id: 'live',
    label: 'Live Now',
    badge: 'LIVE NOW',
    hint: 'I’m at this place right now',
    glyph: '📍',
    color: '#22C55E',
    tier: 0,
    requiresPlace: true,
    verifiable: true,
  },
  on_the_way: {
    id: 'on_the_way',
    label: 'On My Way',
    badge: 'ON MY WAY',
    hint: 'I’m heading there — anyone else going?',
    glyph: '🚍',
    color: colors.accent2,
    tier: 1,
    requiresPlace: true,
    verifiable: false,
  },
  just_finished: {
    id: 'just_finished',
    label: 'Just Finished',
    badge: 'JUST FINISHED',
    hint: 'I’ve just left — here’s how it was',
    glyph: '✅',
    color: colors.accent,
    tier: 2,
    requiresPlace: false,
    verifiable: false,
  },
  memory: {
    id: 'memory',
    label: 'Memory',
    badge: 'MEMORY',
    hint: 'Something from a while back',
    glyph: '📖',
    color: colors.textLo,
    tier: 3,
    requiresPlace: false,
    verifiable: false,
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    badge: 'BLUEPRINT',
    hint: 'A whole day someone can copy',
    glyph: '🗺',
    color: '#A855F7',
    tier: 3,
    requiresPlace: false,
    verifiable: false,
  },
};

// The order the composer offers, most-present-tense first.
export const COMPOSER_TYPES = ['live', 'on_the_way', 'just_finished', 'memory'];

export function experienceMeta(typeId) {
  return EXPERIENCE_TYPES[typeId] ?? EXPERIENCE_TYPES.memory;
}

function ageMins(createdAt, now) {
  if (!createdAt) return Infinity;
  return Math.max(0, (now - new Date(createdAt).getTime()) / 60000);
}

// What a post IS right now, as opposed to what it was posted as.
//
// Decay rules, all one-directional (a post only ever gets less immediate):
//   live          → after LIVE_WINDOW, it becomes "just finished". It keeps its verified
//                   mark: we confirmed they were there, only the present tense expired.
//   on_the_way    → after its window, the trip either happened or didn't; either way it
//                   is no longer news, so it reads as a memory.
//   just_finished → after a day, a memory.
//
// Returns { key, meta, verified, isLive, ageMins } — `key` is the EFFECTIVE type.
export function resolveExperience(post, now = Date.now()) {
  const declared = post?.experienceType ?? 'memory';
  const verified = post?.verification === 'verified';
  const age = ageMins(post?.createdAt, now);

  let key = EXPERIENCE_TYPES[declared] ? declared : 'memory';
  if (key === 'live' && age > LIVE_WINDOW_MINS) key = 'just_finished';
  else if (key === 'on_the_way' && age > ON_THE_WAY_WINDOW_MINS) key = 'memory';
  if (key === 'just_finished' && age > JUST_FINISHED_WINDOW_MINS) key = 'memory';

  return { key, meta: experienceMeta(key), verified, isLive: key === 'live', ageMins: age };
}

// The badge a card shows. A verified live post is the only one that earns the green
// "Live Verified" treatment — that scarcity is the whole point of the badge.
export function experienceBadge(post, now = Date.now()) {
  const { key, meta, verified } = resolveExperience(post, now);
  if (key === 'memory' && !verified) return null;   // the default state needs no badge
  return {
    key,
    label: key === 'live' && verified ? 'LIVE VERIFIED' : meta.badge,
    glyph: meta.glyph,
    color: meta.color,
    verified,
    // A verified-but-past post still says so, quietly — it's earned credibility.
    subtle: !verified && key !== 'live',
  };
}

// Where a post says it happened. Never coordinates — the server stores only a friendly
// label, and we fall back to the tagged place's own name.
export function placeLabel(post) {
  return post?.placeLabel ?? post?.place?.name ?? null;
}

// Ranking weight for the liveness-first feed: 0 is the most immediate. Feeds into
// rankFeed as a hard tier ABOVE engagement, so a live post from a stranger outranks a
// popular memory — which is the entire editorial premise of the feed.
export function experienceTier(post, now = Date.now()) {
  const { key, verified } = resolveExperience(post, now);
  const base = experienceMeta(key).tier;
  // An unverified "live" claim can't happen (the server rewrites it), but a verified
  // past visit still edges out a plain self-declared one at the same tier.
  return verified ? base - 0.5 : base;
}
