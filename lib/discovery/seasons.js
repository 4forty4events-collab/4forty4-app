// Seasonal discovery: map the current month to a mood + the categories that suit
// it, so a "Seasonal picks" shelf reflects the time of year instead of being static.
// Hemisphere-aware — Zimbabwe (ZW) is southern, so its seasons run six months offset
// from Algeria (northern). Categories are drawn from lib/categories slugs.

const SEASONS = {
  winter: { key: 'winter', label: 'Cozy season',       subtitle: 'Warm up indoors',        categories: ['cafe', 'culture', 'entertainment', 'wellness', 'restaurant'] },
  spring: { key: 'spring', label: 'Spring outings',     subtitle: 'Fresh-air favorites',    categories: ['outdoor', 'festival', 'culture', 'tourism'] },
  summer: { key: 'summer', label: 'Sunny-day escapes',  subtitle: 'Make the most of it',    categories: ['outdoor', 'tourism', 'wellness', 'nightlife'] },
  autumn: { key: 'autumn', label: 'Autumn picks',       subtitle: 'Golden-hour spots',      categories: ['cafe', 'culture', 'restaurant', 'shopping'] },
};

function seasonKey(month, southern) {
  // month: 0 (Jan) .. 11 (Dec). Southern hemisphere is offset half a year.
  const m = southern ? (month + 6) % 12 : month;
  if (m === 11 || m <= 1) return 'winter';  // Dec, Jan, Feb
  if (m <= 4) return 'spring';              // Mar, Apr, May
  if (m <= 7) return 'summer';              // Jun, Jul, Aug
  return 'autumn';                          // Sep, Oct, Nov
}

// The season descriptor for a market right now. `market === 'ZW'` -> southern.
export function getSeason(market, date = new Date()) {
  return SEASONS[seasonKey(date.getMonth(), market === 'ZW')];
}
