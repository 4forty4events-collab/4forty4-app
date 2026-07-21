import { supabase } from './supabase';
import { formatVenueTitle } from './format';
import { resolveCategory } from './categories';

// A listing "has a cover image" if it can actually render a photo on a card — a
// non-empty cover URL, or any non-empty entry in its gallery (which the cards fall
// back to). Empty strings / null / missing arrays all count as image-less.
export function hasCoverImage(item) {
  const primary = item?.imageUrl;
  if (primary && String(primary).trim()) return true;
  const arr = item?.imageUrls;
  return Array.isArray(arr) && arr.some((u) => u && String(u).trim());
}

// Drop repeated listings (same kind+id), keeping first occurrence + order. Keyset paging
// can return the same row on two adjacent pages at the cursor boundary; without this the
// flattened list carries duplicates that collide React list keys.
export function dedupeById(items) {
  if (!Array.isArray(items) || items.length < 2) return items ?? [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = `${it?.kind}-${it?.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out.length === items.length ? items : out;
}

// Images-first ordering: keep every image-bearing listing ahead of every image-less
// one, so a placeholder card is never among the first things a user sees. Stable —
// it preserves the incoming order within each group (whatever ranking/sort produced
// it), and returns the original array untouched when there's nothing to relegate.
// Applied at the data-hook layer so Discover, Nearby, Search and the shelves all get
// it; also a safe no-op once the DB `has_cover` sort (discover RPC) is live.
export function sortImagesFirst(items) {
  if (!Array.isArray(items) || items.length < 2) return items ?? [];
  const withImg = [];
  const without = [];
  for (const it of items) (hasCoverImage(it) ? withImg : without).push(it);
  return without.length === 0 ? items : [...withImg, ...without];
}

// Single source of truth for the FeedItem shape. Both the feed and the
// fetch-by-id (Detail deep-link) path normalize through these, so a row always
// becomes the same shape no matter where it's loaded.
export function normalizeVenue(v) {
  return {
    id: v.id, kind: 'venue', title: formatVenueTitle(v.name), rawTitle: v.name,
    // ONE primary category, resolved from the raw column + the name — scraped
    // rows routinely carry a wrong source category (hotels/lounges tagged
    // "restaurant"), so the name gets the final say. See lib/categories.
    category: resolveCategory(v.category, v.name),
    rawCategory: v.category ?? null,
    tags: v.tags ?? [], description: v.description,
    market: v.market, imageUrl: v.cover_image_url ?? null,
    // Gallery (scraped venues). Falls back to the single cover so the carousel
    // always has at least one slide; empty array stays empty (placeholder shows).
    imageUrls: (v.image_urls?.length ? v.image_urls : (v.cover_image_url ? [v.cover_image_url] : [])),
    createdAt: v.created_at,
    startTime: null, price: null, currency: null, priceNote: null,
    venueName: null, city: v.city, address: v.address,
    contactWhatsapp: v.contact_whatsapp ?? null,
    contactPhone: v.contact_phone ?? null,
    contactInstagram: v.contact_instagram ?? null,
    isStub: v.is_stub ?? false,
    // Curation review-status: lastCuratedAt null = pending (in the Manage queue),
    // a timestamp = reviewed. needsReview is the harvester's uncertain-category hint.
    lastCuratedAt: v.last_curated_at ?? null,
    needsReview: v.needs_review ?? false,
    // Normalized planner fields. pricePerPerson is the only one the budget math
    // reads; durationDays drives the Single-Day vs Trip eligibility split.
    pricePerPerson: v.price_per_person ?? null,
    priceType: v.price_type ?? null,
    priceMax: v.price_max ?? null,
    durationDays: v.duration_days ?? 1,
    // Provenance + true coordinates. Google venues carry real lat/lng (pin-precise
    // directions) and need a "Data from Google" attribution; priceEstimated marks
    // a tier-derived price the user should read as approximate.
    source: v.source ?? 'manual',
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
    priceEstimated: v.price_estimated ?? false,
    // Enrichment fields (place-detail scrape). menu is the high-value one:
    // [{section, name, description, price}] in DZD.
    menu: v.menu ?? null,
    menuStatus: v.menu_status ?? null, // 'scraped' | 'pending_manual' | 'manual' | null
    rating: v.rating ?? null,          // Google star rating (trust signal on cards)
    isFeatured: v.is_featured ?? false, // editorial Editor's Picks flag
    organizerId: v.organizer_id ?? null, // owning organizer (claim/management)
    // Hand-entered menu (Curation Toolkit): a pasted body and/or a link, shown
    // on Detail alongside or instead of the structured scraped menu.
    menuText: v.menu_text ?? null,
    menuUrl: v.menu_url ?? null,
    reviewCount: v.review_count ?? null,
    hours: v.hours ?? null,
    googlePlaceId: v.google_place_id ?? null,
    mapsUrl: v.google_maps_url ?? null,
  };
}

export function normalizeEvent(e) {
  return {
    id: e.id, kind: 'event', title: e.title,
    category: resolveCategory(e.category, e.title),
    rawCategory: e.category ?? null,
    tags: e.tags ?? [], description: e.description,
    market: e.market, imageUrl: e.cover_image_url ?? null,
    imageUrls: e.cover_image_url ? [e.cover_image_url] : [], // events are single-image
    createdAt: e.created_at,
    startTime: e.start_time, endTime: e.end_time ?? null, price: e.price, currency: e.currency,
    priceNote: e.price_note, venueName: e.venues?.name ?? null,
    city: null, address: null,
    contactWhatsapp: e.contact_whatsapp ?? null,
    contactPhone: e.contact_phone ?? null,
    contactInstagram: e.contact_instagram ?? null,
    pricePerPerson: e.price_per_person ?? null,
    priceType: e.price_type ?? null,
    priceMax: e.price_max ?? null,
    durationDays: e.duration_days ?? 1,
    // Events come from the manual/Instagram pipeline and have no coordinates;
    // keep the keys present so consumers can read them uniformly.
    source: 'manual',
    latitude: null,
    longitude: null,
    priceEstimated: false,
  };
}

// Single chokepoint for the public feed: market is always injected here, never
// per-screen, so isolation can't be forgotten by a future call site.
export async function fetchFeed(market, category) {
  const nowIso = new Date().toISOString();
  const catFilter = (q) => (category && category !== 'all') ? q.eq('category', category) : q;

  // is_stub = false excludes auto-created scaffolding venues (publish_event's
  // match-or-create) from the feed. They stay in the catalog so events still
  // link to them; they just never appear as their own card. Filtering here on
  // an explicit flag — NOT on category='other', which is a real user choice.
  let vq = supabase.from('venues').select('*').eq('market', market).eq('is_stub', false);
  vq = catFilter(vq);

  // Events: in-market and upcoming only — a past event in a discovery feed is a bug.
  let eq_ = supabase.from('events')
    .select('*, venues(name)')
    .eq('market', market)
    .gte('start_time', nowIso);
  eq_ = catFilter(eq_);

  const [{ data: venues, error: ve }, { data: events, error: ee }] = await Promise.all([vq, eq_]);
  if (ve || ee) throw (ve || ee);

  const items = [
    ...(venues ?? []).map(normalizeVenue),
    ...(events ?? []).map(normalizeEvent),
  ];

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return items;
}

// Load a single listing by id (e.g. after publish lands on Detail, or a future
// deep-link). kind picks the table; the shape matches a feed item exactly.
export async function fetchListingById(kind, id) {
  if (kind === 'venue') {
    const { data, error } = await supabase.from('venues').select('*').eq('id', id).single();
    if (error) throw error;
    return normalizeVenue(data);
  }
  const { data, error } = await supabase
    .from('events').select('*, venues(name)').eq('id', id).single();
  if (error) throw error;
  return normalizeEvent(data);
}
