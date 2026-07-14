// Outing Architect — the intent vocabulary. Structured chips (not free text) so the
// composer produces a solid plan even when the catalog is still filling in. Each
// vibe maps to the catalog categories the day-composition engine should draw from.

export const VIBES = [
  { key: 'surprise', label: 'Surprise me', emoji: '🎲', categories: null },
  { key: 'foodie', label: 'Foodie', emoji: '🍽️', categories: ['restaurant', 'cafe'] },
  { key: 'culture', label: 'Culture', emoji: '🏛️', categories: ['culture', 'tourism'] },
  { key: 'nightlife', label: 'Nightlife', emoji: '🌙', categories: ['nightlife', 'music_event', 'entertainment'] },
  { key: 'outdoors', label: 'Outdoors', emoji: '🌿', categories: ['outdoor', 'sports'] },
  { key: 'chill', label: 'Chill', emoji: '☕', categories: ['cafe', 'wellness'] },
];

export const WHO = [
  { key: 'solo', label: 'Solo', emoji: '🧍' },
  { key: 'date', label: 'Date', emoji: '💞' },
  { key: 'friends', label: 'Friends', emoji: '👥' },
  { key: 'family', label: 'Family', emoji: '🧡' },
];

export const WHEN = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'daytime', label: 'Daytime' },
];

// Per-person budget presets by market currency. `value` feeds the composer; `label`
// is short (the currency is shown alongside in the UI).
export function budgetPresets(market) {
  return market === 'ZW'
    ? [{ label: '10', value: 10 }, { label: '25', value: 25 }, { label: '50', value: 50 }, { label: '100', value: 100 }]
    : [{ label: '1k', value: 1000 }, { label: '2.5k', value: 2500 }, { label: '5k', value: 5000 }, { label: '10k', value: 10000 }];
}

export const vibeByKey = (k) => VIBES.find((v) => v.key === k) ?? VIBES[0];

// Itinerary slot a category belongs to (mirrors the composer's day-type buckets) —
// used only for the result screen's per-stop labels.
const DAY_TYPE = {
  restaurant: 'eat', cafe: 'cafe',
  nightlife: 'do', music_event: 'do', festival: 'do', sports: 'do',
  outdoor: 'do', tourism: 'do', culture: 'do', entertainment: 'do',
  wellness: 'relax',
  shopping: 'extra', hotel: 'extra', education: 'extra', meetup: 'extra', other: 'extra',
};
const SLOT = {
  eat: { label: 'Bite', emoji: '🍽️' },
  cafe: { label: 'Coffee', emoji: '☕' },
  do: { label: 'Do', emoji: '✨' },
  relax: { label: 'Unwind', emoji: '🧖' },
  extra: { label: 'Also', emoji: '➕' },
};
export function slotFor(category) {
  return SLOT[DAY_TYPE[category] ?? 'extra'];
}

// A friendly title from the chosen who + vibe, e.g. "Date-night foodie outing".
export function outingTitle(whoKey, vibeKey) {
  const who = { solo: 'Solo', date: 'Date-night', friends: 'Friends', family: 'Family' }[whoKey] ?? '';
  const vibe = { foodie: 'foodie', culture: 'culture', nightlife: 'night-out', outdoors: 'outdoor', chill: 'chill', surprise: '' }[vibeKey] ?? '';
  const words = [who, vibe, 'outing'].filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
