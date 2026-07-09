export const CATEGORIES = [
  'restaurant', 'cafe', 'nightlife', 'music_event', 'festival', 'sports',
  'outdoor', 'tourism', 'hotel', 'shopping', 'wellness', 'culture',
  'entertainment', 'education', 'meetup', 'other',
];

export const CATEGORY_COLORS = {
  restaurant: '#C2410C', cafe: '#A16207', nightlife: '#6D28D9', music_event: '#BE185D',
  festival: '#DB2777', sports: '#15803D', outdoor: '#047857', tourism: '#0E7490',
  hotel: '#1D4ED8', shopping: '#7C3AED', wellness: '#0D9488', culture: '#B45309',
  entertainment: '#9333EA', education: '#0369A1', meetup: '#4338CA', other: '#475569',
};

// Human-facing labels for the raw category slugs (rail chips, filters). Falls back
// to a capitalized slug for anything unmapped so a new category never renders raw.
export const CATEGORY_LABELS = {
  restaurant: 'Restaurants', cafe: 'Cafés', nightlife: 'Nightlife', music_event: 'Live Music',
  festival: 'Festivals', sports: 'Sports', outdoor: 'Outdoors', tourism: 'Sightseeing',
  hotel: 'Stays', shopping: 'Shopping', wellness: 'Wellness', culture: 'Culture',
  entertainment: 'Entertainment', education: 'Learning', meetup: 'Meetups', other: 'Other',
};

export function categoryLabel(cat) {
  if (!cat) return cat;
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

// The junk/reject bucket — ingest tags unmappable places `category: 'other'`. It is
// a real column value (so plans/detail can read it) but must NEVER surface as a
// browse chip. Add any future catch-all buckets here.
export const HIDDEN_CATEGORIES = ['other'];
