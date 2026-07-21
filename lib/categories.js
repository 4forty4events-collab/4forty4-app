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

// == STRICT PRIMARY CATEGORY ==================================================
// Raw feeds (Google/Bright Data) label things badly: hotels and lounges come back
// as "restaurant", job/agency listings come back as anything at all. Because a
// venue's category drives the planner, the filters and the badge, every listing
// must resolve to exactly ONE primary category — no overlap, no guessing at the
// call site.
//
// resolveCategory() is the single entry point. Order of precedence:
//   1. junk (name OR raw looks like a non-venue listing)  -> 'other'
//   2. STRONG name rules — unambiguous type words in the venue's own name, which
//                          deliberately OVERRIDE a messy source category
//   3. RAW rules         — free-text source category / type string
//   4. the raw value itself, when it is already one of CATEGORIES (not 'other')
//   5. WEAK name rules   — ambiguous type words, fallback only (see below)
//   6. 'other'
// Within each rule list the FIRST match wins, so they are ordered
// most-specific-first: hotel outranks restaurant, so "Hotel Sofitel Restaurant"
// resolves to hotel, not restaurant.

// Non-venues that leak in from scraped feeds (job posts, agencies, admin). These
// never belong in the catalog, so they land in the hidden 'other' bucket.
const JUNK_RE = /\b(jobs?|job\s+listing|hiring|recruit\w*|vacanc\w*|emploi|career|cv|staffing|agence|agency|travel\s+agency|voyages?|assurance|insurance|banque|\bbank\b|pharmac\w+|clinique|clinic|hopital|hospital|consulat|ambassade|notaire|immobili\w+|real\s+estate|auto\s?ecole|driving\s+school)\b/i;

// Name rules come in two strengths, because "the name wins" is only safe for
// UNAMBIGUOUS words.
//
// STRONG — the word names the venue type and essentially cannot mean anything
// else ("Hotel", "Pizzeria", "Nightclub"). These OVERRIDE the source category,
// which is the whole point: a hotel tagged "restaurant" must resolve to hotel.
//
// WEAK — the word often appears in a proper name without describing the venue:
// "Golf Club", "Yacht Club", "Club des Pins" (a beach), "Villa Abd-el-Tif" (a
// museum), "Expo Center", "Spa Villa Nova". Letting these override would corrupt
// listings whose source category was already RIGHT, so they are only consulted
// after the raw rules come up empty.
const STRONG_NAME_RULES = [
  // Hotels / Accommodation — first, so a hotel's restaurant or bar can't steal it.
  ['hotel', /\b(hotels?|h[oô]tels?|resorts?|lodges?|lodging|inns?|motels?|hostels?|guest\s?houses?|guesthouses?|riad|auberge|bed\s+and\s+breakfast|b\s?&\s?b)\b/i],
  // Nightlife / Clubs. Bare "club"/"bar" are WEAK — see below.
  ['nightlife', /\b(night\s?clubs?|nightclubs?|lounges?|pubs?|taverns?|cocktails?|discoth[eè]que|cabaret|speakeasy|shisha|hookah)\b/i],
  // Restaurants / Dining.
  ['restaurant', /\b(restaurants?|resto|grill\s?house|steak\s?house|pizzerias?|pizza|burgers?|kebab|shawarma|sushi|bistros?|brasseries?|braai|diners?|eatery|buffet|trattoria|taqueria|bbq|barbecue|rotisserie)\b/i],
  ['cafe', /\b(caf[eé]s?|coffee|espresso|roaster(?:y|s)?|tea\s?house|salon\s+de\s+th[eé]|p[aâ]tisserie|patisserie|bakery|boulangerie|cr[eê]perie|gelato|ice\s?cream|juice\s?bar)\b/i],
  // Events / Activities — this schema splits them across three slugs.
  ['music_event', /\b(concerts?|live\s+music|dj\s+set|open\s+mic|jam\s+session|afrobeats?\s+night)\b/i],
  ['festival', /\b(festivals?|carnival)\b/i],
  ['entertainment', /\b(cinemas?|movie\s+theat(?:re|er)|arcades?|bowling|karting|go.?karts?|paintball|laser\s?(?:tag|game)|escape\s+(?:room|game)|jeu\s+d'evasion|trampoline|amusement|theme\s+park|water\s?park|parc\s+aquatique|aqua\s?park|mini\s?golf|zoo|aquarium)\b/i],
];

// Same families, ambiguous wording — fallback only, never an override.
const WEAK_NAME_RULES = [
  ['hotel', /\b(chalets?|villas?)\b/i],
  ['nightlife', /\b(clubs?|bars?|disco)\b/i],
  ['restaurant', /\b(grills?|kitchen|noodle)\b/i],
  ['cafe', /\b(glacier)\b/i],
  ['music_event', /\b(gigs?)\b/i],
  ['festival', /\b(fest|expo|fair(?:grounds?)?)\b/i],
];

// Free-text source category / type → primary category. Mirrors the harvester's
// server-side classifier (supabase/functions/ingest-brightdata) so a row means the
// same thing whether it was just scraped or is being re-read from the DB.
const RAW_RULES = [
  ['hotel', /(hotel|lodging|resort|hostel|guest\s?house|riad|motel|auberge|accommodation)/i],
  ['nightlife', /(\bbar\b|\bpub\b|\bclub\b|lounge|nightlife|night\s?club|discoth)/i],
  ['cafe', /(cafe|coffee|tea\s?house|salon\s+de\s+the|bakery|patisserie|pastry|creperie|ice\s?cream|glacier|gelato)/i],
  ['restaurant', /(restaurant|food|diner|eatery|grill|pizz|burger|steak|kebab|fast\s?food|take\s?away|take\s?out|meal|snack)/i],
  ['music_event', /(concert|live\s+music|music|dj|gig)/i],
  ['festival', /(festival|carnival|expo|\bfair\b)/i],
  ['entertainment', /(amusement|theme\s?park|water\s?park|arcade|bowling|karting|go.?kart|paintball|laser|escape|trampoline|adventure\s?park|mini\s?golf|gaming|cinema|movie\s+theater|\bzoo\b|aquarium|playground|entertainment)/i],
  ['wellness', /(spa|hammam|wellness|massage|thermal|thalasso|gym|fitness)/i],
  ['culture', /(museum|gallery|\bart\b|theater|theatre|cultur|monument|heritage|palace|palais|castle|casbah|historic)/i],
  ['outdoor', /(park|garden|jardin|beach|plage|hiking|nature|forest|foret|trail|outdoor|promenade|corniche|viewpoint|point\s+de\s+vue|marina|lake|waterfall|scenic|cable\s?car|telepherique|gondola)/i],
  ['shopping', /(mall|store|\bshop|market|boutique|souk|bazaar)/i],
  ['sports', /(stadium|\bsport|arena|pitch|court|equitation|horse|quad|jet\s?ski|nautical)/i],
  ['tourism', /(touris|attraction|sightseeing|landmark)/i],
  ['education', /(school|university|library|workshop|course|learning|education)/i],
  ['meetup', /(meetup|networking|community\s+event)/i],
];

function firstMatch(rules, text) {
  for (const [category, re] of rules) if (re.test(text)) return category;
  return null;
}

// Resolve a listing's ONE primary category from its raw source category plus its
// name/title. Safe to call with nulls.
export function resolveCategory(rawCategory, name) {
  const raw = String(rawCategory ?? '').trim();
  const title = String(name ?? '').trim();
  // Source types arrive snake_case/kebab-case ('night_club', 'art_gallery',
  // 'movie_theater'). `_` is a word character, so `\bclub\b` would never match
  // 'night_club' — flatten separators to spaces before any rule runs.
  const rawText = raw.toLowerCase().replace(/[_\-]+/g, ' ');

  if ((title && JUNK_RE.test(title)) || (rawText && JUNK_RE.test(rawText))) return 'other';

  const byStrongName = title ? firstMatch(STRONG_NAME_RULES, title) : null;
  if (byStrongName) return byStrongName;

  const byRaw = rawText ? firstMatch(RAW_RULES, rawText) : null;
  if (byRaw) return byRaw;

  // An already-canonical slug is a real classification, so an AMBIGUOUS name word
  // must not override it ("Villa Abd-el-Tif" stored as culture stays culture).
  // 'other' is excluded: it's the junk bucket, so a weak name rule may still
  // rescue a listing out of it.
  if (raw && raw !== 'other' && CATEGORIES.includes(raw)) return raw;

  const byWeakName = title ? firstMatch(WEAK_NAME_RULES, title) : null;
  if (byWeakName) return byWeakName;

  return 'other';
}
