import { createClient } from "jsr:@supabase/supabase-js@2";

// -- Venue ingestion via Bright Data Google Maps scraper -> R2 -> live venues ------
// Admin-only, MANUAL TRIGGER. Straight to live `venues` (private test phase).
// TODO before public launch: route scraped venues through a review-queue gate
// instead of publishing straight to the live feed.
//
// COST DISCIPLINE (protect the credit balance):
//  * records: discovery pulls a full sector (limit_per_input); total spend across
//    a city sweep is governed by the grid-harvester's per-run venue cap.
//  * images: discovery stores ONE cover per NEW venue (light + fast at scale). The
//    full categorized gallery (up to GALLERY_MAX) is built by Step-2 enrichment.
//    Existing venues (by google_place_id) refresh text fields but KEEP their cover,
//    gallery + menu_status -- no photo re-download, no flag clobbering.
//
// PHOTO PRIORITY: if Bright Data tags photos by category (menu/inside/food/...),
// the gallery is ordered menu-first. The public dataset sample only exposes plain
// URLs (no tags), so when no tags are present we fall back to Google's raw order.
// The response reports `gallery_tagged` + `photo_structure` so a real run tells us
// definitively whether menu-first is possible on this endpoint.
//
// ASYNC PATTERN (make-or-break): trigger discovery -> poll progress -> fetch
// snapshot. Bright Data jobs take time; this function polls within a time budget
// and, if the job hasn't finished, returns { pending, snapshot_id } so the client
// can re-invoke with that id to resume (poll -> fetch -> ingest) without re-triggering
// (and without re-spending records).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const DATASET_ID = "gd_m8ebnr0q2qlklc02fz"; // Google Maps full-information scraper
const BD_BASE = "https://api.brightdata.com/datasets/v3";
const GALLERY_MAX = 20; // hard cap on images stored per venue

const MARKET: Record<string, { country: string; currency: string }> = {
  DZ: { country: "DZ", currency: "DZD" },
  ZW: { country: "ZW", currency: "USD" },
};

// Types we NEVER want in the catalog (the FANCYELLOW class). Matched against the
// Google category/type AND the venue name, so junk is killed at the door -- it
// never enters, complementing the composer's runtime blacklist. ASCII only.
const REJECT_TYPE = /(travel agenc|travel agent|agence de voyage|voyagiste|tour operator|\btransport\b|transit|\btaxi\b|bus (station|stop|terminal)|train station|\bmetro\b|\btram\b|airport|car rental|rent a car|location de voiture|\bbank\b|banque|\batm\b|insurance|assurance|pharmac|hospital|\bclinic|clinique|dentist|government|administration|embassy|consulat|\bpolice\b|post office|bureau de poste|notaire|lawyer|avocat|real estate|immobili|gas station|petrol|filling station|\bparking\b|driving school|auto ?ecole|\bschool\b|university)/i;
const ENTERTAIN_TYPE = /(amusement|theme park|water ?park|parc aquatique|aqua ?park|arcade|bowling|karting|go.?kart|paintball|laser|escape|rage room|trampoline|accrobranche|adventure park|parc aventure|mini ?golf|\bgame|gaming|cinema|movie theater|\bzoo\b|aquarium|playground|night club)/i;

// NAME-level classifier, in two strengths. Mirrors STRONG_NAME_RULES /
// WEAK_NAME_RULES in lib/categories.js -- keep the two in step. ASCII only (Bun
// deploy panics otherwise), so accented spellings use their unaccented forms.
//
// STRONG: the word names the venue type and cannot really mean anything else, so
// it OVERRIDES the Google type, which is routinely wrong (hotels and lounges come
// back tagged "restaurant"). Ordered most-specific-first, so "Hotel X Restaurant"
// resolves to hotel, not restaurant.
const STRONG_NAME_RULES: [string, RegExp][] = [
  ["hotel", /\b(hotels?|resorts?|lodges?|lodging|inns?|motels?|hostels?|guest ?houses?|riad|auberge|bed and breakfast)\b/i],
  ["nightlife", /\b(night ?clubs?|lounges?|pubs?|taverns?|cocktails?|discoth\w*|cabaret|shisha|hookah)\b/i],
  ["restaurant", /\b(restaurants?|resto|grill ?house|steak ?house|pizzerias?|pizza|burgers?|kebab|shawarma|sushi|bistros?|brasseries?|braai|diners?|eatery|buffet|trattoria|taqueria|bbq|barbecue|rotisserie)\b/i],
  ["cafe", /\b(cafes?|coffee|espresso|roaster(?:y|s)?|tea ?house|salon de the|patisserie|bakery|boulangerie|creperie|gelato|ice ?cream|juice ?bar)\b/i],
  ["entertainment", /\b(cinemas?|movie theat(?:re|er)|arcades?|bowling|karting|go.?karts?|paintball|laser ?(?:tag|game)|escape (?:room|game)|trampoline|amusement|theme park|water ?park|parc aquatique|mini ?golf|zoo|aquarium)\b/i],
];
// WEAK: words that often sit in a proper name without describing the venue --
// "Golf Club", "Club des Pins" (a beach), "Villa Abd-el-Tif" (a museum). Letting
// these override would corrupt venues whose Google type was already RIGHT, so
// they are only consulted once the type mapping has come up empty.
const WEAK_NAME_RULES: [string, RegExp][] = [
  ["hotel", /\b(chalets?|villas?)\b/i],
  ["nightlife", /\b(clubs?|bars?|disco)\b/i],
  ["restaurant", /\b(grills?|kitchen|noodle)\b/i],
  ["cafe", /\b(glacier)\b/i],
];
function matchName(rules: [string, RegExp][], name: string | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  for (const [cat, re] of rules) if (re.test(n)) return cat;
  return null;
}
// Last resort before the batch fallback: a weak name hint beats a generic
// keyword-level guess, but never beats a real type mapping (which has returned
// by the time this is reached).
function weakOr(name: string | undefined, fallback: string): string {
  return matchName(WEAK_NAME_RULES, name) ?? fallback;
}

// Google type (free text) -> our category, with reject + needs-review signals.
// review=true when we cannot confirm the type and only have a generic fallback.
// A STRONG name match is consulted FIRST so a messy source type can't win; a WEAK
// one only fills in where the type mapping found nothing (see the rule lists).
function classify(raw: string | undefined, fallback: string, name?: string): { category: string; reject: boolean; review: boolean } {
  // Google types arrive snake_case ("night_club", "art_gallery"). `_` is a word
  // character, so \bclub\b would never match -- flatten separators to spaces first.
  const c = (raw ?? "").toLowerCase().replace(/[_\-]+/g, " ");
  if (c && REJECT_TYPE.test(c)) return { category: "other", reject: true, review: false };
  const strong = matchName(STRONG_NAME_RULES, name);
  if (strong) return { category: strong, reject: false, review: false };
  if (!c) return { category: weakOr(name, fallback), reject: false, review: fallback === "other" };
  if (/(restaurant|food|diner|eatery|grill|pizz|burger|steak|kebab|fast food)/.test(c)) return { category: "restaurant", reject: false, review: false };
  if (/(cafe|coffee|tea house|salon de the|bakery|patisserie|pastry|creperie|ice cream|glacier|gelato)/.test(c)) return { category: "cafe", reject: false, review: false };
  if (/(\bbar\b|\bpub\b|\bclub\b|lounge|nightlife)/.test(c)) return { category: "nightlife", reject: false, review: false };
  if (/(hotel|lodging|resort|hostel|guest house|riad|motel)/.test(c)) return { category: "hotel", reject: false, review: false };
  if (ENTERTAIN_TYPE.test(c)) return { category: "entertainment", reject: false, review: false };
  if (/(spa|hammam|wellness|massage|thermal|thalasso|gym|fitness)/.test(c)) return { category: "wellness", reject: false, review: false };
  if (/(museum|gallery|\bart\b|theater|theatre|cultural|monument|heritage|palace|palais|castle|casbah|historic)/.test(c)) return { category: "culture", reject: false, review: false };
  if (/(park|garden|jardin|beach|plage|hiking|nature|forest|foret|trail|outdoor|promenade|corniche|viewpoint|point de vue|marina|lake|waterfall|scenic|cable car|telepherique|teleferique|gondola)/.test(c)) return { category: "outdoor", reject: false, review: false };
  if (/(mall|store|\bshop|market|boutique|souk|bazaar)/.test(c)) return { category: "shopping", reject: false, review: false };
  if (/(stadium|\bsport|arena|pitch|court|equitation|horse|quad|jet ski|nautical|club nautique)/.test(c)) return { category: "sports", reject: false, review: false };
  if (/(tourist|attraction|sightseeing|landmark|viewpoint)/.test(c)) return { category: "tourism", reject: false, review: false };
  return { category: weakOr(name, fallback), reject: false, review: fallback === "other" };
}
// Name-level reject (catches junk mislabeled with a clean/blank Google type).
const REJECT_NAME = /\b(travel|agence|agency|voyage|transport|transit|tram|metro|taxi|autobus|gare|banque|bank|assurance|pharmacie|pharmacy|clinique|hopital|hospital|bureau|consulat|ambassade|notaire|immobili|auto ?ecole)\b/i;

// GEO-GUARD. Sparse keyword searches (karting, paintball, escape room...) leak
// high-ranked FOREIGN Google Maps results past Bright Data's bounding box -- a
// famous US/EU karting park outranks the thin local set and slips in, then gets
// the market label by default (not by verifying its coordinates). So every venue
// must prove it sits inside the target country before it is written. Generous
// NATIONAL bounding boxes (not the Algiers metro box) so legit venues anywhere in
// country pass; only clearly-foreign coordinates are rejected.
const MARKET_BBOX: Record<string, { s: number; n: number; w: number; e: number }> = {
  DZ: { s: 18.5, n: 37.5, w: -9.0, e: 12.5 },   // Algeria
  ZW: { s: -22.7, n: -15.5, w: 25.0, e: 33.2 }, // Zimbabwe
};
// Foreign-country gate on the ADDRESS. The national bbox above is a crude
// rectangle that OVERLAPS neighbor countries -- southern Spain (Almeria ~36.8N),
// Gibraltar, and northern Morocco all sit inside Algeria's lat/long box -- so a
// coordinate check alone lets them through. Google/Bright Data addresses END with
// the country, so we anchor the match at end-of-string: this rejects "..., Spain"
// / "..., Morocco" / "..., Gibraltar" while sparing legit Algerian rows whose
// address omits the country (many do: "Rue X, Kouba") or ends in "Algeria/Algerie"
// -- and it will NOT false-trigger on a mid-address street name ("Rue de France").
// ASCII only. Neighbors included explicitly (morocco/maroc/tunisia/libya/mali/
// niger/mauritania/western sahara/gibraltar/spain).
const FOREIGN_ADDRESS = /\b(united states|u\.?s\.?a|usa|canada|united kingdom|england|scotland|wales|ireland|france|spain|espana|portugal|italy|italia|germany|deutschland|belgium|netherlands|switzerland|austria|poland|greece|turkey|turkiye|russia|ukraine|china|japan|south korea|korea|india|pakistan|indonesia|malaysia|thailand|vietnam|philippines|australia|new zealand|brazil|argentina|mexico|panama|chile|colombia|peru|egypt|saudi arabia|qatar|united arab emirates|uae|kuwait|bahrain|oman|jordan|lebanon|israel|morocco|maroc|tunisia|tunisie|libya|mali|niger|mauritania|western sahara|gibraltar|nigeria|kenya|south africa|ghana|senegal)[\s.,]*$/i;
// True when a venue is out-of-country by EITHER signal (either alone rejects):
//   (1) coordinates fall outside the market's national bbox, OR
//   (2) the address ends with a foreign country name.
// (2) runs ALWAYS, not just when coords are missing -- that was the bug that let
// Spanish/Moroccan venues inside the overlapping bbox slip in.
function outOfCountry(market: string, lat: number, lng: number, address: unknown): boolean {
  const bbox = MARKET_BBOX[market];
  if (!bbox) return false;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (hasCoords && (lat < bbox.s || lat > bbox.n || lng < bbox.w || lng > bbox.e)) return true;
  if (address && FOREIGN_ADDRESS.test(String(address))) return true;
  return false;
}

// Per-person DZD price defaults by category for activities Google gives no price
// level for. Scaled by the neighborhood multiplier. 0 -> a FREE venue (price_type
// 'free'); the budget planner uses free venues, but only when price is not null.
const CATEGORY_DEFAULT_DZD: Record<string, number> = {
  outdoor: 0, park: 0, culture: 300, landmark: 300, museum: 300, tourism: 200,
  wellness: 1500, entertainment: 1200, sports: 800,
};

// Bright Data price signal (number 0-4, or "$"/"$$"/"$$$", or a range string)
// -> 0-4 smallint. Returns null when there's no usable signal.
function priceLevelSmallint(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && raw >= 0 && raw <= 4) return Math.round(raw);
  const s = String(raw);
  const dollars = (s.match(/\$/g) ?? []).length;
  if (dollars >= 1) return Math.min(dollars, 4);
  return null;
}
const PRICE_BY_CURRENCY: Record<string, number[]> = {
  // index = price_level 0..4 -> per-person estimate (baseline / default neighborhood)
  DZD: [0, 400, 1200, 2500, 5000],
  USD: [0, 5, 15, 35, 70],
};

// Neighborhood price variance: the SAME price tier costs more in premium areas.
// The per-person baseline above is scaled by this multiplier, keyed on the venue's
// area (the `city` field we store per run). Default 1.0 for anywhere unlisted.
const NEIGHBORHOOD_MULTIPLIER: Record<string, number> = {
  hydra: 1.4, "sidi yahia": 1.45, cheraga: 1.35, "dely brahim": 1.3,
  "dely ibrahim": 1.3, "ben aknoun": 1.25, "el biar": 1.2, "bir mourad rais": 1.1,
  kouba: 1.0, "bab ezzouar": 1.0, "el harrach": 0.9, "hussein dey": 0.95,
  "ain benian": 0.95,
};
// Strip combining accent marks (a char-code filter, NOT a regex literal, so this
// file stays pure ASCII -- literal accent marks crash the Bun functions deploy).
function stripAccents(s: string): string {
  return [...s.normalize("NFD")]
    .filter((ch) => { const c = ch.charCodeAt(0); return c < 0x300 || c > 0x36f; })
    .join("");
}

function areaMultiplier(area: string | null | undefined): number {
  if (!area) return 1;
  // Accent-fold + lowercase so dashboard/address input matches the table keys.
  const key = stripAccents(area).trim().toLowerCase();
  return NEIGHBORHOOD_MULTIPLIER[key] ?? 1;
}

// Derive a venue's REAL municipality from its Google address instead of stamping it
// with the sweep SECTOR name. A grid sector search returns venues from neighbouring
// areas too (e.g. the Birtouta sweep pulled venues actually in Blida/Tipaza/Bordj El
// Kiffan), so the sector name mislabels them. Address shape is
// "<street/plus-code>, <City> <postcode>, <Country>": take the segment before the
// country, drop a trailing postal code. Falls back to `fallback` (the sector name)
// whenever the address yields no real city -- plus-code-only, empty, or all-digits --
// so we never regress to a worse label. Country match is accent-folded (Algerie/ie).
const COUNTRY_RE = /^(alger(ia|ie)|zimbabwe)$/i;
function cityFromAddress(address: unknown, fallback: string | null): string | null {
  if (typeof address !== "string" || !address.trim()) return fallback;
  let parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length && COUNTRY_RE.test(stripAccents(parts[parts.length - 1]))) {
    parts = parts.slice(0, -1);
  }
  if (parts.length === 0) return fallback;
  const city = parts[parts.length - 1].replace(/\s+\d{4,6}$/, "").trim();
  if (!city || city.includes("+") || /^\d+$/.test(city)) return fallback;
  return city;
}

// Categories where a menu is expected -- discovery flags these 'pending_manual'
// so the manual-entry backlog exists even before (selective) enrichment runs.
const MENU_RELEVANT = new Set(["restaurant", "cafe", "nightlife", "hotel"]);

// -- R2 upload (AWS SigV4, Web Crypto) -- copied from import-places. --------------
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (msg: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(msg)));
async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
const uriEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };

async function presignPutUrl(opts: {
  accountId: string; bucket: string; key: string; contentType: string; accessKey: string; secretKey: string;
}): Promise<string> {
  const { accountId, bucket, key, contentType, accessKey, secretKey } = opts;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto", service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = "/" + uriEncode(bucket) + "/" + key.split("/").map(uriEncode).join("/");
  const signedHeaders = "content-type;host";
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQs = Object.keys(query).sort().map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`).join("&");
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQs, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const kDate = await hmac(enc.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQs}&X-Amz-Signature=${signature}`;
}

// Fetch ANY image URL once, push to R2, return the permanent public URL. Null on
// any failure -- a missing photo must not abort the venue.
async function storePhoto(imageUrl: string, r2: {
  accountId: string; bucket: string; accessKey: string; secretKey: string; publicBase: string;
}): Promise<string | null> {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const ext = EXT[ct] ?? "jpg";
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const key = `listings/google/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await presignPutUrl({
      accountId: r2.accountId, bucket: r2.bucket, key, contentType: ct, accessKey: r2.accessKey, secretKey: r2.secretKey,
    });
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": ct }, body: bytes });
    if (!put.ok) return null;
    return `${r2.publicBase}/${key}`;
  } catch {
    return null;
  }
}

// Bounded-concurrency map -- keeps a 20-image gallery from firing 20 fetches at
// once (and from dragging the ingest invocation toward the timeout).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

// Download up to GALLERY_MAX images -> R2, preserving order. Drops failures.
async function storeGallery(urls: string[], r2: {
  accountId: string; bucket: string; accessKey: string; secretKey: string; publicBase: string;
}): Promise<string[]> {
  const slice = urls.slice(0, GALLERY_MAX);
  const stored = await mapLimit(slice, 6, (u) => storePhoto(u, r2));
  return stored.filter((x): x is string => typeof x === "string");
}

// -- Bright Data helpers --------------------------------------------------------
const bdHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });

// "Discover by location": this dataset searches by coordinates + keyword, NOT by
// a text address or URL. country + lat/long + zoom_level + keyword are the inputs.
async function triggerCollection(
  token: string,
  input: { country: string; lat: number; long: number; zoom_level: number; keyword: string },
  limit: number,
): Promise<string> {
  const url = `${BD_BASE}/trigger?dataset_id=${DATASET_ID}&type=discover_new&discover_by=location&include_errors=true&limit_per_input=${limit}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: bdHeaders(token),
    body: JSON.stringify([input]),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    // Surface Bright Data's actual message so a bad input shape is diagnosable.
    throw new Error(`Bright Data trigger failed (${resp.status}): ${detail.slice(0, 400)}`);
  }
  const data = await resp.json();
  const snapshotId = data?.snapshot_id;
  if (!snapshotId) throw new Error(`Bright Data returned no snapshot_id: ${JSON.stringify(data).slice(0, 300)}`);
  return snapshotId;
}

// "Collect by URL": fetches ONE place's full detail page (menu, categorized
// photos, hours, reviews) from its Google Maps URL. No type/discover_by params.
async function triggerCollectByUrl(token: string, url: string): Promise<string> {
  const resp = await fetch(`${BD_BASE}/trigger?dataset_id=${DATASET_ID}&include_errors=true`, {
    method: "POST",
    headers: bdHeaders(token),
    body: JSON.stringify([{ url }]),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Bright Data enrich trigger failed (${resp.status}): ${detail.slice(0, 400)}`);
  }
  const data = await resp.json();
  const snapshotId = data?.snapshot_id;
  if (!snapshotId) throw new Error(`Bright Data returned no snapshot_id: ${JSON.stringify(data).slice(0, 300)}`);
  return snapshotId;
}

async function getProgress(token: string, snapshotId: string): Promise<string> {
  const resp = await fetch(`${BD_BASE}/progress/${snapshotId}`, { headers: bdHeaders(token) });
  if (!resp.ok) throw new Error(`progress failed (${resp.status})`);
  const data = await resp.json();
  return String(data?.status ?? "unknown");
}

async function fetchSnapshot(token: string, snapshotId: string): Promise<any[]> {
  const resp = await fetch(`${BD_BASE}/snapshot/${snapshotId}?format=json`, { headers: bdHeaders(token) });
  if (!resp.ok) throw new Error(`snapshot fetch failed (${resp.status})`);
  const data = await resp.json();
  return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
}

// Pull values tolerant of field-name drift across dataset versions.
function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj?.[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
}
// Photo category -> priority (lower = earlier in the gallery). Menus first
// (highest value for restaurants/cafes/hotels), then interior, food, atmosphere.
// Untagged photos sort after tagged ones but keep Google's raw order among
// themselves. Unknown tags sit just ahead of untagged.
const PHOTO_TAG_PRIORITY: [RegExp, number][] = [
  [/menu|prix|price/i, 0],
  [/featured|hero|cover/i, 1],
  [/inside|interior|indoor/i, 2],
  [/food|dish|drink|meal|cuisine|plat/i, 3],
  [/atmosphere|ambien|vibe|owner/i, 4],
];
function tagPriority(tag: string | null): number {
  if (!tag) return 9; // untagged
  for (const [re, p] of PHOTO_TAG_PRIORITY) if (re.test(tag)) return p;
  return 8; // tagged, but not a category we rank
}

// Collect every photo URL the record exposes, tolerant of field-name drift, as
// ordered {url, tag} candidates. Hero/main image is seeded first.
function collectPhotoCandidates(place: any): { url: string; tag: string | null }[] {
  const out: { url: string; tag: string | null }[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, tag: unknown) => {
    if (typeof url === "string" && url && !seen.has(url)) {
      seen.add(url);
      out.push({ url, tag: typeof tag === "string" && tag ? tag : null });
    }
  };
  push(pick(place, ["featured_image", "main_image", "image", "photo", "thumbnail"]), "featured");
  for (const field of ["photos", "photos_and_videos", "images", "photo_urls", "gallery"]) {
    const arr = place?.[field];
    if (!Array.isArray(arr)) continue;
    for (const el of arr) {
      if (typeof el === "string") push(el, null);
      else if (el && typeof el === "object") {
        push(
          pick(el, ["url", "image", "src", "link", "photo_url", "image_url"]),
          pick(el, ["category", "type", "label", "caption", "tag", "name", "title", "group"]),
        );
      }
    }
  }
  return out;
}

// Rank candidates menu-first when tags exist; otherwise keep raw order. Returns
// the top GALLERY_MAX urls and whether ANY category tag was actually present.
function rankPhotos(cands: { url: string; tag: string | null }[]): { urls: string[]; tagged: boolean } {
  const tagged = cands.some((c) => c.tag != null);
  const ranked = cands
    .map((c, i) => ({ url: c.url, p: tagPriority(c.tag), i }))
    .sort((a, b) => a.p - b.p || a.i - b.i);
  return { urls: ranked.slice(0, GALLERY_MAX).map((c) => c.url), tagged };
}

// One-line description of the real photo-array shape, for the response so a live
// run tells us definitively whether menu-first tagging is available.
function describePhotoStructure(places: any[]): string {
  for (const pl of places) {
    for (const field of ["photos", "photos_and_videos", "images", "photo_urls", "gallery"]) {
      const arr = pl?.[field];
      if (Array.isArray(arr) && arr.length) {
        const el = arr[0];
        if (typeof el === "string") return `${field}: url-strings (no tags)`;
        if (el && typeof el === "object") return `${field}: objects {${Object.keys(el).join(", ")}}`;
      }
    }
  }
  return "no photo array (main_image only)";
}

// Normalize Bright Data's `menu` (shape unconfirmed) into a predictable flat list
// the Detail screen can render: [{section, name, description, price}]. Tolerant of
// flat item arrays, section-with-items arrays, and section->items object maps.
type MenuItem = { section: string | null; name: string | null; description: string | null; price: string | null };
function pushMenuItem(out: MenuItem[], it: any, section: string | null) {
  if (it == null) return;
  if (typeof it === "string") { out.push({ section, name: it, description: null, price: null }); return; }
  if (typeof it !== "object") return;
  const name = pick(it, ["name", "title", "dish", "item", "label"]);
  const price = pick(it, ["price", "cost", "amount", "value"]);
  const description = pick(it, ["description", "desc", "details", "subtitle"]);
  if (name || price) {
    out.push({
      section,
      name: name != null ? String(name) : null,
      description: description != null ? String(description) : null,
      price: price != null ? String(price) : null,
    });
  }
}
function normalizeMenu(raw: any): MenuItem[] | null {
  if (raw == null) return null;
  const out: MenuItem[] = [];
  const walkArray = (arr: any[]) => {
    for (const el of arr) {
      const items = el?.items ?? el?.dishes ?? el?.products ?? el?.menu_items;
      if (Array.isArray(items)) {
        const sec = pick(el, ["section", "category", "name", "title", "group"]);
        for (const it of items) pushMenuItem(out, it, sec != null ? String(sec) : null);
      } else {
        pushMenuItem(out, el, null);
      }
    }
  };
  if (Array.isArray(raw)) {
    walkArray(raw);
  } else if (typeof raw === "object") {
    const sections = raw.sections ?? raw.categories ?? raw.menu ?? raw.items;
    if (Array.isArray(sections)) walkArray(sections);
    else for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) for (const it of v) pushMenuItem(out, it, k);
  }
  return out.length ? out : null;
}
// One-line shape of the raw menu field, for the response so a live run tells us
// whether the normalizer matched (and we refine it against real data if not).
function describeMenu(raw: any): string {
  if (raw == null) return "no menu field";
  if (Array.isArray(raw)) {
    const f = raw[0];
    const inner = f && typeof f === "object" ? `{${Object.keys(f).join(",")}}` : typeof f;
    return `array[${raw.length}] first=${inner}`;
  }
  if (typeof raw === "object") return `object {${Object.keys(raw).join(",")}}`;
  return typeof raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const { action = "discover", market, keyword, lat, long, zoom_level, city, category, count, snapshot_id, place_id, maps_url } = body;
    if (!MARKET[market]) return json({ error: "market must be 'DZ' or 'ZW'." }, 400);

    // Auth gate -- admin only.
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Not authenticated." }, 401);
    const { data: isAdmin } = await authed.rpc("is_admin");
    if (!isAdmin) return json({ error: "Admin only." }, 403);

    const token = Deno.env.get("BRIGHTDATA_API_TOKEN");
    if (!token) return json({ error: "BRIGHTDATA_API_TOKEN not configured." }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const r2 = {
      accountId: Deno.env.get("R2_ACCOUNT_ID")!,
      bucket: Deno.env.get("R2_BUCKET_NAME")!,
      accessKey: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      publicBase: Deno.env.get("R2_PUBLIC_BASE_URL")!,
    };

    // ---- STEP 2: ENRICH one venue via collect-by-URL (full place page). --------
    // Same short-invocation async pattern: first call triggers + returns a
    // snapshot_id; the app re-invokes to poll; on ready we fetch the single rich
    // record, extract menu + categorized photos + hours/reviews, and UPDATE the
    // existing venue row (matched by google_place_id).
    if (action === "enrich") {
      if (!snapshot_id) {
        // Resolve the Maps URL: prefer the one passed in, else look it up by place_id.
        let url = typeof maps_url === "string" && maps_url ? maps_url : null;
        if (!url && place_id) {
          const { data: v } = await admin
            .from("venues").select("google_maps_url").eq("google_place_id", place_id).maybeSingle();
          url = v?.google_maps_url ?? null;
        }
        if (!url) return json({ error: "enrich needs maps_url, or a place_id with a stored google_maps_url." }, 400);
        const snapshotId = await triggerCollectByUrl(token, url);
        return json({
          ok: true, pending: true, action: "enrich", snapshot_id: snapshotId, place_id: place_id ?? null,
          message: "Enriching this venue (~2 min). Polling for the full place page...",
        });
      }

      const status = await getProgress(token, snapshot_id);
      if (status === "failed") return json({ error: "Bright Data enrich job failed.", snapshot_id }, 502);
      if (status !== "ready") {
        return json({ ok: true, pending: true, action: "enrich", snapshot_id, place_id: place_id ?? null, status, message: `Still enriching (${status})...` });
      }

      const records = await fetchSnapshot(token, snapshot_id);
      const rec = records[0];
      if (!rec) return json({ ok: true, action: "enrich", message: "Enrichment returned no record.", snapshot_id });
      const targetId = pick(rec, ["place_id", "fid", "google_id", "cid"]) ?? place_id;
      if (!targetId) return json({ error: "Could not determine place_id from the enriched record.", snapshot_id }, 500);

      // Menu (the high-value field) + categorized gallery + richer fields.
      const rawMenu = pick(rec, ["menu", "menus", "menu_items"]);
      const menu = normalizeMenu(rawMenu);
      const { urls, tagged } = rankPhotos(collectPhotoCandidates(rec));
      const gallery = await storeGallery(urls, r2);
      const ratingN = Number(pick(rec, ["rating", "average_rating", "reviews_rating"]));
      let reviewCount = pick(rec, ["reviews_count", "review_count"]);
      if (reviewCount == null && Array.isArray(rec?.reviews)) reviewCount = rec.reviews.length;
      const hours = pick(rec, ["open_hours", "hours", "opening_hours"]);
      const phone = pick(rec, ["phone_number", "phone", "international_phone"]);
      const description = pick(rec, ["description", "about", "summary"]);

      // Conditional update: only overwrite a field when we actually got a value, so
      // enrichment never wipes existing data. menu_status records the outcome so the
      // manual-entry tools can pick up venues whose menu the scrape couldn't find.
      const update: Record<string, unknown> = { menu, menu_status: menu?.length ? "scraped" : "pending_manual" };
      if (gallery.length) { update.image_urls = gallery; update.cover_image_url = gallery[0]; }
      if (Number.isFinite(ratingN)) update.rating = ratingN;
      if (reviewCount != null && !Number.isNaN(Number(reviewCount))) update.review_count = Number(reviewCount);
      if (hours != null) update.hours = hours;
      if (phone) update.contact_phone = phone;
      if (description) update.description = description;

      const { data: updated, error: upErr } = await admin
        .from("venues").update(update).eq("google_place_id", targetId).select("id, name").maybeSingle();
      if (upErr) return json({ error: "Venue enrich update failed.", detail: upErr.message, snapshot_id }, 500);
      if (!updated) return json({ error: `No venue with google_place_id ${targetId} to enrich.`, snapshot_id }, 404);

      return json({
        ok: true,
        action: "enrich",
        venue: updated.name,
        menu_items: menu?.length ?? 0,
        gallery_tagged: tagged, // tags should exist on this endpoint -> menu-first works
        images: gallery.length,
        photo_structure: describePhotoStructure(records),
        menu_debug: describeMenu(rawMenu), // raw shape, so we refine the normalizer if needed
        message: menu?.length
          ? `Enriched "${updated.name}": ${menu.length} menu items, ${gallery.length} photos.`
          : `Enriched "${updated.name}": no menu found (${describeMenu(rawMenu)}), ${gallery.length} photos.`,
      });
    }

    // Full-dataset pull: no testing clamp. limit_per_input caps records per input;
    // Bright Data returns at most what it finds near the point. A high default lets
    // a sector fill; the grid-harvester governs total spend via its per-run cap.
    const limit = Math.min(Math.max(Number(count) || 100, 1), 1000);

    // The scrape averages ~2m19s, well past a single Edge Function's safe runtime.
    // So invocations are SHORT: the first triggers and returns a snapshot_id; the
    // app then auto-polls (re-invoking with snapshot_id), and each poll does one
    // progress check -- only ingesting once the job is "ready". No invocation blocks
    // for minutes, so the function never times out mid-job.
    if (!snapshot_id) {
      const kw = typeof keyword === "string" ? keyword.trim() : "";
      if (!kw) return json({ error: "keyword is required (e.g. 'restaurants')." }, 400);
      const latN = Number(lat), longN = Number(long);
      if (!Number.isFinite(latN) || !Number.isFinite(longN)) {
        return json({ error: "lat and long are required numbers." }, 400);
      }
      const snapshotId = await triggerCollection(token, {
        country: MARKET[market].country,
        lat: latN,
        long: longN,
        zoom_level: Number(zoom_level) || 15,
        keyword: kw,
      }, limit);
      return json({
        ok: true, pending: true, snapshot_id: snapshotId,
        message: "Scraping started (~2 min). Polling for results...",
      });
    }

    // Resume: one progress check per call.
    const snapshotId = snapshot_id;
    const status = await getProgress(token, snapshotId);
    if (status === "failed") {
      return json({ error: "Bright Data job failed.", snapshot_id: snapshotId }, 502);
    }
    if (status !== "ready") {
      return json({ ok: true, pending: true, snapshot_id: snapshotId, status, message: `Still scraping (${status})...` });
    }

    // status === ready -> fetch + ingest.
    const places = await fetchSnapshot(token, snapshotId);
    const currency = MARKET[market].currency;
    const batchCategory = typeof category === "string" && category ? category : "other";

    // Normalize + drop permanently-closed + require a place_id (the dedup key).
    const normalized = places
      .map((p) => {
        const name = pick(p, ["name", "title"]);
        const cls = classify(pick(p, ["category", "categories", "type", "main_category"]), batchCategory, name ? String(name) : undefined);
        const nameReject = cls.reject || (name ? REJECT_NAME.test(String(name)) : false);
        const address = pick(p, ["address", "full_address", "formatted_address"]);
        const lat = Number(pick(p, ["latitude", "lat"]));
        const lng = Number(pick(p, ["longitude", "lng", "lon"]));
        const geoReject = outOfCountry(market, lat, lng, address);
        return {
          placeId: pick(p, ["place_id", "fid", "google_id", "cid"]),
          name,
          address,
          lat,
          lng,
          category: cls.category,
          needsReview: cls.review,
          reject: nameReject || geoReject,
          geoReject,
          rating: pick(p, ["rating", "average_rating", "reviews_rating"]),
          reviewCount: pick(p, ["reviews_count", "review_count", "reviews_cnt", "user_ratings_total"]),
          priceLevel: priceLevelSmallint(pick(p, ["price_level", "price", "price_range"])),
          photos: collectPhotoCandidates(p),
          mapsUrl: pick(p, ["url", "link", "google_maps_url", "maps_url"]),
          // Google's editorial/about text captured AT DISCOVERY (was enrich-only, and
          // enrich never runs on activity categories) so every venue -- parks, karting,
          // beaches -- can carry a real description. Renders on Detail + feeds curator
          // narration. Real Google text only; null when absent (no LLM generation here).
          description: pick(p, ["description", "about", "summary", "editorial_summary", "overview"]),
          hours: pick(p, ["open_hours", "hours", "opening_hours"]),
          closed: p?.permanently_closed === true || pick(p, ["business_status"]) === "CLOSED_PERMANENTLY",
        };
      });

    // Reject junk (agencies/transport/offices) AND out-of-country leaks at the
    // door; count each for reporting. geoReject is the coordinate/country guard.
    const usable = normalized.filter((p) => p.placeId && p.name && !p.closed);
    const rejectedCount = usable.filter((p) => p.reject).length;
    const geoRejectedCount = usable.filter((p) => p.geoReject).length;

    // Collapse intra-batch duplicate place_ids (kept = usable minus rejects).
    const byId = new Map<string, typeof normalized[number]>();
    for (const p of usable) if (!p.reject && !byId.has(p.placeId)) byId.set(p.placeId, p);
    const unique = [...byId.values()];

    const total = unique.length;
    if (total === 0) {
      return json({ ok: true, total: 0, imported: 0, existed: 0, images: 0, message: "No usable venues returned.", snapshot_id: snapshotId });
    }

    // Which place_ids do we already have? Existing venues refresh text fields but
    // KEEP their cover + gallery + menu_status (no photo re-download, no clobbering
    // a manually-entered or already-scraped menu flag) -- the credit-discipline rule.
    const placeIds = unique.map((p) => p.placeId);
    const { data: existingRows } = await admin
      .from("venues").select("google_place_id, cover_image_url, image_urls, menu_status, price_estimated, price_per_person, price_type, review_count, description, hours").in("google_place_id", placeIds);
    const existingMap = new Map(
      (existingRows ?? []).map((r) => [r.google_place_id, {
        cover: r.cover_image_url, gallery: r.image_urls, menuStatus: r.menu_status,
        priceEstimated: r.price_estimated, pricePerPerson: r.price_per_person, priceType: r.price_type,
        reviewCount: r.review_count, description: r.description, hours: r.hours,
      }]),
    );

    // DISCOVERY IS LIGHT: one cover per NEW venue, not the full gallery. Pulling 20
    // images x hundreds of venues in a single invocation would time out -- the full
    // categorized (menus-first) gallery is built later by Step-2 enrichment. Covers
    // download with bounded concurrency so even a dense sector finishes fast.
    const newVenues = unique.filter((p) => !existingMap.has(p.placeId));
    const coverByPlace = new Map<string, string>();
    await mapLimit(newVenues, 6, async (p) => {
      const heroUrl = p.photos[0]?.url ?? null; // collectPhotoCandidates seeds the hero first
      if (!heroUrl) return;
      const stored = await storePhoto(heroUrl, r2);
      if (stored) coverByPlace.set(p.placeId, stored);
    });

    // Neighborhood price variance is now applied PER VENUE: the multiplier is keyed on
    // each venue's real area (derived from its address in the loop), not the sweep sector.
    // sectorMult is the sweep sector's nominal factor, kept for the response summary only.
    const sectorMult = areaMultiplier(typeof city === "string" ? city : null);
    let imagesTransferred = 0;
    const rows = [];
    for (const p of unique) {
      // Real municipality from the address, falling back to the sweep sector name.
      // Drives BOTH the stored city and the price multiplier so a venue pulled from a
      // neighbouring area is labelled AND priced for where it actually is.
      const venueCity = cityFromAddress(p.address, typeof city === "string" && city ? city : null);
      const mult = areaMultiplier(venueCity);
      let gallery: string[];
      let menuStatus: string | null;
      if (existingMap.has(p.placeId)) {
        const ex = existingMap.get(p.placeId)!;
        gallery = ex.gallery ?? [];
        if (ex.cover && !gallery.includes(ex.cover)) gallery = [ex.cover, ...gallery];
        menuStatus = ex.menuStatus ?? null; // preserve scraped/manual flag
      } else {
        const cover = coverByPlace.get(p.placeId) ?? null;
        gallery = cover ? [cover] : [];
        if (cover) imagesTransferred += 1;
        // Menu data comes from Step-2 enrichment; flag menu-bearing categories now
        // so the manual-entry backlog exists even for venues never auto-enriched.
        menuStatus = MENU_RELEVANT.has(p.category) ? "pending_manual" : null;
      }
      const cover = gallery[0] ?? null;
      // Pricing: (1) preserve a manually/menu-priced venue (price_estimated=false)
      // untouched; (2) else use Google's price level; (3) else a category default
      // (DZD) so activities are visible to the planner. base 0 -> a FREE venue.
      const ex = existingMap.get(p.placeId);
      const manualPriced = !!ex && ex.priceEstimated === false;
      let perPerson: number | null = null;
      let priceType: string | null = null;
      if (manualPriced) {
        perPerson = ex!.pricePerPerson ?? null;
        priceType = ex!.priceType ?? null;
      } else if (p.priceLevel != null) {
        const baseline = PRICE_BY_CURRENCY[currency]?.[p.priceLevel] ?? null;
        if (baseline != null) { perPerson = Math.round(baseline * mult); priceType = "per_person"; }
      } else if (currency === "DZD" && CATEGORY_DEFAULT_DZD[p.category] != null) {
        const base = CATEGORY_DEFAULT_DZD[p.category];
        perPerson = Math.round(base * mult);
        priceType = base === 0 ? "free" : "per_person";
      }
      rows.push({
        google_place_id: p.placeId,
        name: p.name,
        address: p.address,
        city: venueCity,
        latitude: Number.isFinite(p.lat) ? p.lat : null,
        longitude: Number.isFinite(p.lng) ? p.lng : null,
        category: p.category,
        needs_review: p.needsReview === true,
        rating: p.rating != null && !Number.isNaN(Number(p.rating)) ? Number(p.rating) : null,
        // review_count at DISCOVERY (was enrich-only) so activities clear the
        // composer's reviews>=5 floor. Preserve an existing (enriched) count when
        // this scrape has none, so a null never wipes a real value.
        review_count: (() => {
          const rc = Array.isArray(p.reviewCount) ? p.reviewCount.length : p.reviewCount;
          const n = rc != null && !Number.isNaN(Number(rc)) ? Number(rc) : null;
          return n != null ? n : (ex?.reviewCount ?? null);
        })(),
        price_level: p.priceLevel,
        cover_image_url: cover,
        image_urls: gallery,
        google_maps_url: p.mapsUrl, // enables Step-2 enrichment later
        // Preserve on null: never let a re-harvest with no description/hours wipe a
        // value a prior pass (or enrichment) already captured.
        description: p.description != null && p.description !== "" ? String(p.description) : (ex?.description ?? null),
        hours: p.hours != null ? p.hours : (ex?.hours ?? null),
        menu_status: menuStatus,
        market,
        source: "google_maps_scrape",
        price_estimated: !manualPriced, // manual/menu price stays authoritative
        price_per_person: perPerson,
        price_type: priceType,
        duration_days: 1, // venues are Single-Day eligible
        is_stub: false,
      });
    }

    // Upsert on google_place_id: new rows insert, existing rows refresh. No dupes.
    const { data: upserted, error: upErr } = await admin
      .from("venues")
      .upsert(rows, { onConflict: "google_place_id" })
      .select("id");
    if (upErr) return json({ error: "Venue upsert failed.", detail: upErr.message, snapshot_id: snapshotId }, 500);

    const imported = upserted?.length ?? 0;
    const existed = existingMap.size;
    const newCount = imported - existed;
    const descriptions = rows.filter((r) => r.description != null).length; // rows carrying real Google text
    return json({
      ok: true,
      total,
      imported: newCount,
      existed,
      rejected: rejectedCount, // junk (agencies/transport/offices) dropped at the door
      rejected_geo: geoRejectedCount, // out-of-country leaks blocked by the geo-guard
      images: imagesTransferred,
      descriptions, // venues in this batch with a real Google description
      area_multiplier: sectorMult, // sweep sector's nominal factor (pricing is now per-venue)
      photo_structure: describePhotoStructure(places), // real shape, for diagnosis
      message: `${newCount} new - ${existed} refreshed - ${rejectedCount} rejected (${geoRejectedCount} out-of-country) - ${descriptions} descriptions - ${imagesTransferred} covers to R2 (sector x${sectorMult} pricing).`,
    });
  } catch (e) {
    return json({ error: "Unexpected error.", detail: String((e as Error).message ?? e) }, 500);
  }
});
