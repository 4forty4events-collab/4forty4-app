import { createClient } from "jsr:@supabase/supabase-js@2";

// Coordination AI Curator -- Hybrid Multi-Source Retrieval (RAG).
// The SERVER owns selection and existence; Claude Haiku only narrates.
//
// Flow:
//   1) Intent gate (before any paid call):
//      a) REMOVAL  -> match this trip's current stops by name, delete via the
//         shared remove_trip_item RPC (which also records the removed id in a
//         system card's venue_ids so it is excluded going forward). No LLM.
//      b) NAMED VENUE -> the user named a real place: force it into the card.
//      c) GENERAL curation -> build a candidate pool from the catalog + public
//         blueprints, then SUBTRACT every id seen in venue_ids across the last 10
//         messages (already-suggested and removed places).
//   2) The server picks the final ordered venue array (1 stop, or 3-5 for a
//      full-day ask) and builds the card payload from real ids.
//   3) Haiku narrates ONLY that provided array -- it never invents, drops, or
//      rules on existence, and never apologizes.
// Every id on the card is also written to trip_messages.venue_ids.

const CITY: Record<string, string> = { DZ: "Algiers", ZW: "Harare" };
const SLOTS = ["Morning", "Midday", "Afternoon", "Evening", "Night"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// Run the paid loop only when the message is a recommendation / plan / location ask.
const INTENT = /\b(recommend|recommendation|suggest|suggestion|where|best|itinerary|visit|eat|eating|dinner|lunch|breakfast|brunch|cafe|coffee|drinks?|bar|pub|club|restaurant|rooftop|museum|historic|history|cultural|culture|landmark|monument|gallery|beach|park|hike|hiking|activity|activities|event|events|shopping|nearby|hungry|thirsty|adventure|thrill|intense)\b/i;
const INTENT_PHRASE = /(things to do|places? to|spots? to|somewhere to|go out|night out|what should we|where should we|any ideas|for the boys|full day)/i;
const hasIntent = (t: string) => INTENT.test(t) || INTENT_PHRASE.test(t) || (/\?\s*$/.test(t) && t.trim().length > 10);
const COOLDOWN_MS = 45_000;
// Full-day / multi-stop intent. Widened to the many shapes users actually type
// ("for a day", "a day", "1 day", "day out", "journee", ...). Regex only.
// "journ.?e" matches journee / journee-with-accent / journe without any non-ASCII
// byte in the source (the "." spans the accented vowel).
const FULLDAY = /\b(?:full\s*day|whole\s*day|all day|entire day|for (?:a|the) day|(?:a|one|1|two|2|three|3) days?|day plan|day trip|day out|outing|plan (?:a |our |the |us a |my )?day|journ.?e|itinerary for|plan .*(?:saturday|sunday|weekend))\b/i;
// Repeat-correction ("I said ...") -> fold the prior ask back in as intent.
const REPEAT = /\bi (?:said|told you|already said|asked for|meant|repeat)\b/i;
// "Activities / things to do / games" -> steer toward do-things (entertainment +
// outdoor), the most common ask and previously unmapped (returned food/museums).
const ACTIVITY = /\b(?:activities|activity|things? to do|something to do|stuff to do|do something|game night|games|arcades?|fun stuff|superdope|super dope)\b/i;
// Quantity complaint -> the user wants MORE than one place. Escalate to the
// multi-stop (full-day) path. Regex only; the model never classifies intent.
const MORE = /\b(?:only one|one (?:place|spot|option) only|just one|why (?:only |just )?one|why (?:you |are you )?giving (?:me )?one|more (?:places|options|spots|ideas|choices)|other (?:places|options)|i said (?:places|spots)|need more|give me more|too few|not enough)\b/i;
// A specific place is being NAMED for the plan ("add X", "put X on the list").
// This gates the named-venue lookup so general curation is never mistaken for it.
const NAMED_REQUEST = /\b(?:add|include|put|reserve|book|get me)\b|\b(?:on|to)\s+(?:the|my|our)\s+(?:list|plan|itinerary)\b/i;
// Filler + category + vibe words. What survives after stripping these from a message
// is the proper-noun run we treat as a venue name. Deliberately does NOT contain
// distinctive place words (e.g. "dream", "parc") so "dream parc" survives as a phrase.
const GENERIC = new Set(
  ("a an the this that these those some any my our your their his her its me you us we they he she it " +
   "to on in at of for and or but with without please lets let can could would should will do does " +
   "add put include get want need like love find show give make plan planning book reserve suggest curate " +
   "somewhere someplace place places spot spots venue venues option options choice choices idea ideas thing things " +
   "list itinerary day days today tonight tomorrow morning afternoon evening night weekend saturday sunday " +
   "nice good cool great best lovely amazing awesome fun cheap fancy new local authentic traditional real proper " +
   "full whole entire all more most other another something anything everything " +
   "cafe coffee restaurant resto eatery bar pub club rooftop lounge park garden beach seaside museum gallery " +
   "hammam spa dinner lunch breakfast brunch food foodie drink drinks meal cuisine activity activities outing trip tour " +
   "chill chilled relax relaxed relaxing romantic date couple culture cultural historic history heritage nightlife party " +
   "family kids children boys adventure thrill thrilling intense adrenaline extreme wild hardcore epic hype trending vibe vibes energy")
    .split(/\s+/),
);
// Longest contiguous run of non-generic tokens = the phrase the user is naming.
const namedRun = (text: string): string[] => {
  const toks = text.replace(/[^a-z0-9 ]+/gi, " ").toLowerCase().split(/\s+/).filter(Boolean);
  let best: string[] = [];
  let cur: string[] = [];
  for (const w of toks) {
    if (w.length >= 3 && !GENERIC.has(w)) { cur.push(w); if (cur.length > best.length) best = cur.slice(); }
    else cur = [];
  }
  return best;
};
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// Removal intent: "remove / drop / take out / get rid of ... <a stop already pinned>".
const REMOVE = /\b(remove|delete|get rid of|take out|scrap|ditch|drop)\b/i;

// Vibe -> extra search terms (bias the relevance scan) + tags (overlap filter) +
// categories (force-inject: pull whole categories even when venues are untagged).
const VIBES: { re: RegExp; terms: string; tags: string[]; cats: string[] }[] = [
  { re: /\b(intense|thrill|adventure|adrenaline|extreme|wild|hardcore|action|boys|epic)\b/i, terms: "adventure thrill adrenaline karting paintball climbing outdoor sport activity", tags: ["adventure", "thrill", "intense", "sport", "outdoor", "activity", "escape-room"], cats: ["entertainment", "tourism", "sport", "activity", "amusement"] },
  { re: /\b(chill|relax|calm|cozy|easy|laid ?back)\b/i, terms: "cafe lounge spa park garden relaxed", tags: ["chill", "relax", "cafe"], cats: ["cafe", "park", "spa"] },
  { re: /\b(romantic|date|couple|anniversary)\b/i, terms: "rooftop fine dining sunset intimate", tags: ["romantic", "rooftop"], cats: ["restaurant", "rooftop"] },
  { re: /\b(culture|cultural|historic|history|museum|art|heritage)\b/i, terms: "museum gallery landmark heritage cultural", tags: ["culture", "historic", "landmark"], cats: ["culture", "landmark", "museum", "tourism"] },
  { re: /\b(night|nightlife|party|club|bar|drinks)\b/i, terms: "bar club lounge nightlife live music", tags: ["nightlife", "bar"], cats: ["bar", "club", "lounge"] },
  { re: /\b(food|foodie|eat|dinner|lunch|cuisine|restaurant)\b/i, terms: "restaurant authentic local cuisine grill", tags: ["food", "restaurant"], cats: ["restaurant", "cafe"] },
  { re: /\b(family|kids|children)\b/i, terms: "park zoo amusement family activity", tags: ["family", "kids"], cats: ["entertainment", "tourism", "park", "amusement"] },
  { re: /\b(activit|things? to do|something to do|games?|fun|do something)\b/i, terms: "activity entertainment attraction karting bowling paintball park adventure fun outdoor games", tags: ["activity", "entertainment", "fun", "outdoor", "adventure"], cats: ["entertainment", "outdoor", "park", "sports", "tourism"] },
];

// The model NARRATES the provided selection. It never selects, invents, or rules on
// existence -- the server has already guaranteed every place is real and chosen.
function systemPrompt(market: string): string {
  const city = CITY[market] ?? market;
  return `You are a warm, sharp local fixer in ${city}, talking to a group of friends
who are planning an outing together.

You will be given a SELECTION: an ordered list of real places already chosen for this
group, each with a name, category, rating and a short description. Your ONLY job is to
narrate that selection in your fixer voice.

Hard rules:
- Talk ONLY about the places in the SELECTION. Never invent, add, drop, or rename a
  place, and never mention anything that is not in the list.
- Never comment on whether a place exists, never say you could not find something, and
  never apologize. Every place is real and already chosen for them.
- Be specific: tie each place to the group's stated vibe using its name and
  description. If there are several stops, narrate them as one flowing plan.
- 2 to 3 sentences total. No lists, no markdown, no emojis, no headings.

Return ONE JSON object and nothing else, no code fences:
{ "message": string }`;
}

// ============================ COMPOSER ======================================
// Deterministic day composition. The LLM never selects; it only narrates the
// finished plan (see systemPrompt). Category vocabulary is the real catalog set:
// restaurant cafe nightlife hotel culture landmark museum outdoor park shopping
// wellness sports tourism entertainment other.

// Market centroids (no centroid table exists). Algiers is the default market.
const CENTROID: Record<string, { lat: number; lng: number }> = {
  DZ: { lat: 36.7538, lng: 3.0588 },
  ZW: { lat: -17.8252, lng: 31.0335 },
};
const COMPOSER_RADIUS_M = 35000;

// Junk that must NEVER auto-compose. There is no travel_agency/transport/services
// CATEGORY in the catalog, so the name regex is the real workhorse (scrape junk is
// miscategorized as tourism/other). Blacklisted venues stay reachable only via an
// explicit named-venue request.
const BLACKLIST_CATS = new Set(["travel_agency", "transport", "services", "service", "office", "government", "other"]);
const BLACKLIST_NAME = /\b(travel|agence|agency|voyage|tour operator|touring|transport|transit|tram|metro|bus|gare|station|taxi|rent a car|car rental|location de voiture|assurance|insurance|bank|banque|atm|clinic|clinique|hospital|hopital|pharmac|bureau|office|administration|consulat|embassy|ambassade|notaire|avocat|lawyer|immobili|real estate|autoecole|driving school|garage|mechanic)\b/i;
// Gaming/arcade by NAME (no such category exists). Capped per day unless asked for.
const GAMING_NAME = /\b(game|gaming|games|arcade|playstation|ps4|ps5|xbox|vr\b|bowling|billiard|billard|snooker|laser ?tag|karaoke)\b/i;

type CVenue = { id: string; name: string; category: string | null; tags: string[]; description: string | null; rating: number | null; review_count: number | null; lat: number | null; lng: number | null };
type Slot = { title: string; cats: string[]; anchor?: boolean; standout?: boolean };
type Template = { name: string; slots: Slot[]; gamingCap: number; excludeGaming: boolean; social: boolean };

const isGaming = (v: CVenue) => GAMING_NAME.test(v.name ?? "");
const isBlacklisted = (v: CVenue) =>
  BLACKLIST_CATS.has(String(v.category ?? "other")) || BLACKLIST_NAME.test(v.name ?? "");

// Occasion keyword -> template variant (dictionary + regex, never the LLM).
function pickTemplate(text: string): Template {
  const t = text.toLowerCase();
  if (/\b(birthday|anniversary|celebrat)/.test(t)) {
    return { name: "birthday", gamingCap: 1, excludeGaming: false, social: false, slots: [
      { title: "Morning coffee", cats: ["cafe", "park", "outdoor"] },
      { title: "Activity", cats: ["entertainment", "outdoor", "sports", "tourism"] },
      { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
      { title: "Celebration dinner", cats: ["restaurant"], anchor: true, standout: true },
      { title: "Night out", cats: ["entertainment", "nightlife", "hotel"] },
    ] };
  }
  if (/\b(date|romantic|girlfriend|boyfriend|couple|honeymoon)/.test(t)) {
    return { name: "romantic", gamingCap: 0, excludeGaming: true, social: false, slots: [
      { title: "Morning coffee", cats: ["cafe", "culture", "landmark"] },
      { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
      { title: "Culture", cats: ["culture", "landmark", "museum", "tourism"] },
      { title: "Scenic spot", cats: ["outdoor", "park", "tourism", "landmark"] },
      { title: "Dinner", cats: ["restaurant"], anchor: true, standout: true },
    ] };
  }
  if (/\b(chill|relax|calm|quiet|low ?key|laid ?back|lazy|mellow)/.test(t)) {
    return { name: "chill", gamingCap: 0, excludeGaming: true, social: false, slots: [
      { title: "Slow morning", cats: ["cafe", "park", "outdoor"] },
      { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
      { title: "Outdoors", cats: ["park", "outdoor", "tourism"] },
      { title: "Culture", cats: ["culture", "landmark", "museum"] },
      { title: "Easy evening", cats: ["cafe", "hotel", "restaurant"] },
    ] };
  }
  if (/\b(intense|action|adrenaline|gaming|thrill|adventure|epic|for the boys|hardcore|wild)/.test(t)) {
    return { name: "high-energy", gamingCap: 2, excludeGaming: false, social: false, slots: [
      { title: "Morning move", cats: ["outdoor", "sports", "entertainment", "tourism"] },
      { title: "Action", cats: ["entertainment", "sports", "outdoor"] },
      { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
      { title: "Afternoon thrill", cats: ["entertainment", "sports", "outdoor", "tourism"] },
      { title: "Dinner", cats: ["restaurant"], anchor: true },
    ] };
  }
  if (ACTIVITY.test(t)) {
    return { name: "activity-packed", gamingCap: 2, excludeGaming: false, social: false, slots: [
      { title: "Morning", cats: ["outdoor", "park", "tourism", "entertainment"] },
      { title: "Activity", cats: ["entertainment", "sports", "outdoor"] },
      { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
      { title: "Afternoon", cats: ["entertainment", "outdoor", "sports", "tourism"] },
      { title: "Dinner", cats: ["restaurant"], anchor: true },
    ] };
  }
  if (/\b(strangers|meet (?:people|someone|new)|social|networking|mingle|make friends)/.test(t)) {
    return { name: "social", gamingCap: 1, excludeGaming: false, social: true, slots: [
      { title: "Morning", cats: ["cafe", "outdoor", "park", "tourism"] },
      { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
      { title: "Afternoon", cats: ["entertainment", "outdoor", "culture", "sports", "tourism"] },
      { title: "Dinner", cats: ["restaurant"], anchor: true },
      { title: "Night", cats: ["nightlife", "entertainment", "cafe", "hotel"] },
    ] };
  }
  return { name: "default", gamingCap: 1, excludeGaming: false, social: false, slots: [
    { title: "Morning", cats: ["outdoor", "park", "culture", "landmark", "tourism", "cafe"] },
    { title: "Lunch", cats: ["restaurant", "cafe"], anchor: true },
    { title: "Afternoon", cats: ["entertainment", "outdoor", "park", "culture", "museum", "sports", "tourism"] },
    { title: "Dinner", cats: ["restaurant"], anchor: true },
    { title: "Night", cats: ["entertainment", "nightlife", "cafe", "hotel"] },
  ] };
}

const R_EARTH_KM = 6371;
function haversineKm(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): number {
  if (!a || !b || a.lat == null || b.lat == null) return 8; // unknown coords -> neutral
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
function weightedPick<T>(items: { v: T; s: number }[]): T {
  const total = items.reduce((a, x) => a + Math.max(x.s, 0), 0);
  if (total <= 0) return items[0].v;
  let r = Math.random() * total;
  for (const x of items) { r -= Math.max(x.s, 0); if (r <= 0) return x.v; }
  return items[items.length - 1].v;
}

// Compose an ordered day from a (already blacklist- and exclusion-filtered) pool.
// forced = a named venue guaranteed as the first stop. Returns ordered CVenue[]
// with their slot titles.
function composeDay(pool: CVenue[], tpl: Template, forced: CVenue | null, centroid: { lat: number; lng: number }, gamingAsked: boolean):
  { slot: string; v: CVenue }[] {
  const used = new Set<string>();
  const picks: { slot: string; v: CVenue }[] = [];
  let lastCat: string | null = null;
  let gaming = 0;
  const gamingCap = gamingAsked ? 3 : tpl.gamingCap;
  let prev: { lat: number; lng: number } = centroid;

  // Rating stays dominant even when review_count is unknown/0 (most scraped
  // activities have a Google rating but no review count) -- reviews only BOOST.
  const weight = (v: CVenue) => {
    const reviews = Number(v.review_count) || 0;
    const base = (Number(v.rating) || 3.5) * (1 + Math.log(1 + reviews)) + 0.05;
    return tpl.social ? base * (1 + Math.log(1 + reviews)) : base;
  };
  // Food anchors (lunch/dinner) are exempt from the no-consecutive-category rule --
  // a template may place lunch and dinner adjacent, and both must stay food.
  const eligible = (v: CVenue, cats: string[] | null, anchor?: boolean) =>
    !used.has(v.id) &&
    (!cats || cats.includes(String(v.category ?? ""))) &&
    (anchor || v.category !== lastCat) &&
    !(tpl.excludeGaming && isGaming(v)) &&
    !(isGaming(v) && gaming >= gamingCap);

  const take = (v: CVenue, slot: string) => {
    picks.push({ slot, v });
    used.add(v.id);
    lastCat = v.category ?? null;
    if (isGaming(v)) gaming++;
    if (v.lat != null && v.lng != null) prev = { lat: v.lat, lng: v.lng };
  };

  if (forced) take(forced, tpl.slots[0].title);

  for (let i = forced ? 1 : 0; i < tpl.slots.length; i++) {
    const slot = tpl.slots[i];
    // Quality floor: rating >= 4, and reviews >= 5 OR unknown (null) -- an unknown
    // review count must not be treated as zero, or all scraped activities vanish.
    const good = pool.filter((v) => eligible(v, slot.cats, slot.anchor) && (Number(v.rating) || 0) >= 4.0 && (v.review_count == null || Number(v.review_count) >= 5));
    let set = good.length ? good : pool.filter((v) => eligible(v, slot.cats, slot.anchor));
    if (!set.length) set = pool.filter((v) => eligible(v, slot.anchor ? ["restaurant", "cafe"] : null, slot.anchor)); // widen (anchors stay food)
    if (!set.length) continue;
    let chosen: CVenue;
    if (slot.standout) {
      chosen = set.slice().sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (Number(b.review_count) || 0) - (Number(a.review_count) || 0))[0];
    } else {
      const topK = set.slice().sort((a, b) => weight(b) - weight(a)).slice(0, 8);
      const scored = topK.map((v) => ({ v, s: weight(v) / (1 + haversineKm(prev, v.lat != null ? { lat: v.lat, lng: v.lng } : null) / 6) }));
      chosen = weightedPick(scored);
    }
    take(chosen, slot.title);
  }

  // Food anchors: guarantee at least one restaurant/cafe anchor. If none landed
  // (pool exhaustion), swap the weakest non-forced, non-food pick for the best
  // unused restaurant, else cafe.
  const isFood = (v: CVenue) => v.category === "restaurant" || v.category === "cafe";
  if (!picks.some((p) => isFood(p.v))) {
    const food = pool.filter((v) => !used.has(v.id) && (v.category === "restaurant" || v.category === "cafe"))
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0];
    if (food) {
      const swapIdx = picks.findIndex((p, idx) => (idx > 0 || !forced) && !isFood(p.v));
      if (swapIdx >= 0) picks[swapIdx] = { slot: picks[swapIdx].slot, v: food };
      else picks.push({ slot: "Food", v: food });
    }
  }
  return picks;
}

// Enforce the 2-3 sentence cap on every narration path, cutting on a sentence
// boundary so a reply never truncates mid-word.
function clampSentences(s: string, max = 3): string {
  const t = String(s ?? "").trim();
  if (!t) return t;
  const parts = t.match(/[^.!?]+[.!?]+/g);
  if (parts && parts.length) return parts.slice(0, max).join(" ").trim();
  return t.length > 300 ? t.slice(0, t.lastIndexOf(" ", 300)).trim() : t; // no terminal punct
}

// Narrate a finished selection (message-only). Returns null on any failure so the
// caller keeps its templated, non-apologetic fallback.
async function narrateLLM(system: string, user: string): Promise<string | null> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return null;
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    const m = String(parsed?.message ?? "").trim();
    return m ? clampSentences(m) : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const tripId: string | undefined = body?.trip_id ?? body?.record?.trip_id;
    if (body?.record?.is_ai_response === true) return json({ skipped: "ai_trigger" });
    if (!tripId) return json({ error: "trip_id required" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const curatorSecret = Deno.env.get("CURATOR_SECRET");
    const isService = authHeader === `Bearer ${serviceKey}` ||
      (!!curatorSecret && req.headers.get("x-curator-secret") === curatorSecret);
    if (!isService) {
      const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Not authenticated." }, 401);
      const { data: ok } = await userClient.rpc("is_trip_participant", { p_trip: tripId });
      if (!ok) return json({ error: "Not a trip participant." }, 403);
    }

    const admin = createClient(url, serviceKey);

    const { data: trip } = await admin.from("collaborative_trips").select("market").eq("id", tripId).maybeSingle();
    if (!trip) return json({ error: "trip not found" }, 404);
    const market = trip.market ?? "DZ";

    const { data: msgs } = await admin.from("trip_messages")
      .select("body, is_ai_response, created_at, payload, venue_ids").eq("trip_id", tripId)
      .order("created_at", { ascending: false }).limit(10);
    const recent = (msgs ?? []).slice().reverse();
    if (recent.length === 0) return json({ skipped: "no_messages" });
    const newest = recent[recent.length - 1];
    if (newest.is_ai_response) return json({ skipped: "last_is_ai" });

    const triggerText = String(newest.body ?? "");
    // The "Ask AI" button sends ask_ai:true -> treat the whole message as an
    // explicit ask (skip the intent gate + cooldown), no "/ai" prefix needed. A
    // typed "/ai ..." is still accepted for backward compatibility.
    const explicit = body?.ask_ai === true || /^\s*\/ai\b/i.test(triggerText);
    const cleanTrigger = triggerText.replace(/^\s*\/ai\b/i, "").trim();
    const lcTrigger = cleanTrigger.toLowerCase();

    // ---- INTENT GATE 2a: REMOVAL (before low-signal, cooldown, and any LLM) ----
    // "remove/drop/take out ... <name>" -> match against THIS trip's current stops
    // by name and delete via the shared RPC. If nothing matches, treat it as a
    // removal turn anyway (do NOT fall through to suggesting new places).
    if (REMOVE.test(lcTrigger)) {
      const { data: curItems } = await admin.from("trip_items")
        .select("id, venue:venues(id, name), event:events(id, title)")
        .eq("trip_id", tripId);
      // Content words only (drop the remove verb + filler) so "remove mrz games"
      // matches an item named "Mrz Games", not the word "remove".
      const words = (lcTrigger.match(/[a-z0-9]{3,}/g) ?? [])
        .filter((w) => !GENERIC.has(w) && !/^(remove|delete|drop|scrap|ditch|take|rid|out|off)$/.test(w));
      let hitId: string | null = null;
      let hitLen = 0;
      for (const it of (curItems ?? []) as any[]) {
        const nm = String(it.venue?.name ?? it.event?.title ?? "").toLowerCase().trim();
        if (nm.length < 3) continue;
        const matches = lcTrigger.includes(nm) || words.some((w) => nm.includes(w));
        if (matches && nm.length > hitLen) { hitId = it.id; hitLen = nm.length; }
      }
      if (hitId) {
        const { error: rmErr } = await admin.rpc("remove_trip_item", { p_item: hitId });
        if (rmErr) return json({ error: "remove_failed", detail: rmErr.message }, 500);
        return json({ ok: true, action: "removed" });
      }
      // REMOVE fired but nothing on the itinerary matched. Reply with a visible
      // notice and STOP -- never fall through to suggesting new places.
      const objName = words.join(" ").trim();
      const notice = objName ? `${titleCase(objName)} isn't on your itinerary yet.` : "That place isn't on your itinerary yet.";
      await admin.from("trip_messages")
        .insert({ trip_id: tripId, user_id: null, is_ai_response: true, body: notice, payload: null, venue_ids: [] });
      return json({ ok: true, action: "remove_no_match" });
    }

    // Intent. A quantity complaint ("only one") or a repeat-correction ("I said ...")
    // folds the prior ask back in, so a correction re-triggers the earlier intent.
    // FULLDAY now also catches "wholeday"/"fullday"; ACTIVITY steers do-things.
    const priorText = recent.filter((m) => !m.is_ai_response).map((m) => m.body).filter(Boolean).join(" ");
    const escalate = REPEAT.test(cleanTrigger) || MORE.test(cleanTrigger);
    const intentText = (escalate ? `${cleanTrigger} ${priorText}` : cleanTrigger).trim();
    const fullDay = FULLDAY.test(intentText) || MORE.test(cleanTrigger);
    const activityAsk = ACTIVITY.test(intentText);
    const namedReq = NAMED_REQUEST.test(lcTrigger);
    if (!explicit && !hasIntent(cleanTrigger) && !fullDay && !namedReq && !activityAsk) return json({ ok: true, skipped: "low_signal" });
    if (!explicit) {
      const { data: lastAi } = await admin.from("trip_messages")
        .select("created_at").eq("trip_id", tripId).eq("is_ai_response", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastAi && Date.now() - new Date(lastAi.created_at).getTime() < COOLDOWN_MS) return json({ ok: true, skipped: "cooldown" });
    }

    const userText = `${cleanTrigger} ${priorText}`.trim();
    const wantN = fullDay ? 16 : 10;

    // ---- exclusion: every id offered OR removed in the last 10 messages ----
    // Union of payload ids (what actually rendered on each card -- the proven,
    // reliable source) AND venue_ids. Never re-suggest within the window. This runs
    // BEFORE selection, so it applies to the FULLDAY path too.
    const excluded = new Set<string>();
    for (const m of recent) {
      const p: any = (m as any).payload;
      if (p) {
        if (p.id) excluded.add(String(p.id));
        if (Array.isArray(p.items)) p.items.forEach((it: any) => it?.id && excluded.add(String(it.id)));
      }
      const ids: any = (m as any).venue_ids;
      if (Array.isArray(ids)) ids.forEach((id) => id && excluded.add(String(id)));
    }

    // ---- INTENT GATE 2b: NAMED VENUE (before pool build / any LLM) ----
    // A specific place is named -> match the LONGEST non-generic phrase first, never
    // a stray token. A multi-word named phrase with no catalog hit -> say it is not
    // in the catalog and STOP (a confident wrong pick is worse than saying so). A
    // single distinctive token that misses just falls through to general curation.
    const lookupVenue = async (q: string): Promise<any> => {
      const { data } = await admin.from("venues")
        .select("id, name, category, tags, description, rating, review_count")
        .eq("market", market).eq("is_stub", false).ilike("name", `%${q}%`).limit(8);
      if (!data || !data.length) return null;
      const rows = (data as any[]).slice().sort((a, b) =>
        (String(a.name).length - String(b.name).length) || ((b.review_count ?? 0) - (a.review_count ?? 0)));
      const v = rows[0];
      return { kind: "venue", id: v.id, title: v.name, category: v.category ?? null, tags: v.tags ?? [], note: String(v.description ?? "").slice(0, 200), rating: v.rating ?? null, reviewCount: v.review_count ?? null };
    };

    let forced: any = null;
    if (namedReq) {
      const run = namedRun(lcTrigger);
      if (run.length >= 2) {
        forced = await lookupVenue(run.join(" "));
        if (!forced) {
          const notice = `${titleCase(run.join(" "))} isn't in the catalog yet.`;
          await admin.from("trip_messages")
            .insert({ trip_id: tripId, user_id: null, is_ai_response: true, body: notice, payload: null, venue_ids: [] });
          return json({ ok: true, action: "named_miss" });
        }
      } else if (run.length === 1 && run[0].length >= 4) {
        forced = await lookupVenue(run[0]); // single distinctive token; miss -> fall through
      }
    }

    // ---- FULL-DAY COMPOSER (deterministic day-shape; LLM narrates only) ----
    if (fullDay) {
      const centroid = CENTROID[market] ?? CENTROID.DZ;
      const { data: rawPool } = await admin.rpc("composer_pool", { p_market: market, p_lat: centroid.lat, p_lng: centroid.lng, p_radius_m: COMPOSER_RADIUS_M, p_limit: 150 });
      const cpool: CVenue[] = ((rawPool ?? []) as any[])
        .map((v) => ({ id: v.id, name: v.name, category: v.category, tags: Array.isArray(v.tags) ? v.tags : [], description: v.description, rating: v.rating, review_count: v.review_count, lat: v.lat, lng: v.lng }))
        .filter((v) => !isBlacklisted(v) && !excluded.has(String(v.id)) && (!forced || v.id !== forced.id));
      const gamingAsked = /\b(gaming|arcade|games)\b/i.test(userText);
      const tpl = pickTemplate(userText);
      const forcedC: CVenue | null = forced
        ? { id: forced.id, name: forced.title, category: forced.category, tags: forced.tags ?? [], description: forced.note ?? null, rating: forced.rating ?? null, review_count: forced.reviewCount ?? null, lat: null, lng: null }
        : null;
      const day = composeDay(cpool, tpl, forcedC, centroid, gamingAsked);
      if (day.length >= 2) {
        const subC = (c: CVenue) => `${cap(c.category)} - ${CITY[market] ?? market}`;
        const items = day.map((d) => ({ slot_title: d.slot, kind: "venue", id: d.v.id, title: d.v.name, subtitle: subC(d.v) }));
        const venueIds = items.map((it) => it.id);
        const rateC = (c: CVenue) => (c.rating != null ? `${c.rating}/5${c.review_count ? ` from ${c.review_count} reviews` : ""}` : "unrated");
        const selLines = day.map((d, i) => `${i + 1}. [${d.slot}] "${d.v.name}" | ${d.v.category ?? "-"} | rating ${rateC(d.v)} | ${(d.v.description ?? "").slice(0, 200) || "(no description)"}`).join("\n");
        const chatLog = recent.slice(-6).map((m) => `${m.is_ai_response ? "fixer" : "guest"}: ${m.body ?? ""}`).join("\n");
        const occLine = tpl.name !== "default" ? `\nThis is a ${tpl.name} outing -- weave that occasion in naturally.` : "";
        const userContent = `Group ask: "${cleanTrigger}"${occLine}\n\nRecent chat:\n${chatLog}\n\nSELECTION (narrate ONLY these, in order):\n${selLines}`;
        const names = day.map((d) => d.v.name);
        const message = (await narrateLLM(systemPrompt(market), userContent)) || `Here is your ${tpl.name === "default" ? "" : tpl.name + " "}day: ${names.join(", ")}.`;
        const payload = { items, _template: tpl.name };
        const { data: inserted, error: insErr } = await admin.from("trip_messages")
          .insert({ trip_id: tripId, user_id: null, is_ai_response: true, body: message, payload, venue_ids: venueIds })
          .select("id").single();
        if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);
        return json({ ok: true, message_id: inserted.id, composed: venueIds.length, template: tpl.name });
      }
      // Thin pool -> fall through to the legacy discover selection below.
    }

    // ---- vibe ----
    let vibeTerms = "";
    const vibeTags = new Set<string>();
    const vibeCats = new Set<string>();
    for (const v of VIBES) if (v.re.test(userText)) { vibeTerms += " " + v.terms; v.tags.forEach((tg) => vibeTags.add(tg)); v.cats.forEach((c) => vibeCats.add(c)); }
    const searchText = `${userText} ${vibeTerms}`.trim().slice(0, 500);

    // ---- candidate pool (real, non-recycled ids only) ----
    const pool = new Map<string, any>();
    const add = (kind: string, id: string, title: string, category: any, tags: any, note: any, rating?: any, reviewCount?: any) => {
      if (id && !excluded.has(String(id)) && !pool.has(id)) {
        pool.set(id, {
          kind, id, title: title ?? "Place", category: category ?? null,
          tags: Array.isArray(tags) ? tags : [], note: String(note ?? "").slice(0, 200),
          rating: rating ?? null, reviewCount: reviewCount ?? null,
        });
      }
    };

    // A0) FORCE-INJECT vibe matches FIRST, by tag overlap OR category, so prime spots
    // (e.g. Prison Island / Fantasia Land) always enter the pool even when untagged.
    if (vibeTags.size) {
      const { data } = await admin.from("venues")
        .select("id, name, category, tags, description, rating, review_count").eq("market", market).eq("is_stub", false)
        .overlaps("tags", Array.from(vibeTags)).limit(12);
      (data ?? []).forEach((v: any) => add("venue", v.id, v.name, v.category, v.tags, v.description, v.rating, v.review_count));
    }
    if (vibeCats.size) {
      const { data } = await admin.from("venues")
        .select("id, name, category, tags, description, rating, review_count").eq("market", market).eq("is_stub", false)
        .in("category", Array.from(vibeCats)).order("review_count", { ascending: false, nullsFirst: false }).limit(12);
      (data ?? []).forEach((v: any) => add("venue", v.id, v.name, v.category, v.tags, v.description, v.rating, v.review_count));
    }

    // A1) relevance scan (PostGIS + trigram) over venues + events
    const scan = async (text: string | null, sort: string) => {
      const { data } = await admin.rpc("discover", { p_market: market, p_text: text, p_kinds: ["venue", "event"], p_sort: sort, p_limit: wantN });
      (data ?? []).forEach((r: any) => add(r.kind, r.out_id, r.item?.name ?? r.item?.title, r.item?.category, r.item?.tags, r.item?.description, r.item?.rating, r.item?.review_count));
    };
    await scan(searchText || null, searchText ? "relevance" : "rating");
    if (pool.size === 0) await scan(null, "rating"); // never empty-handed

    // B) public blueprints: add their stops as real candidates (structure learned by
    // the server's ordering, so no blueprint text is fed to the model).
    const { data: pubTrips } = await admin.rpc("list_public_trips", { p_limit: 8 });
    const tripIds = (pubTrips ?? []).map((t: any) => t.id);
    if (tripIds.length) {
      const { data: bpItems } = await admin.from("trip_items")
        .select("venue:venues(id, name, category, tags, description, rating, review_count), event:events(id, title, category, tags, description)")
        .in("trip_id", tripIds);
      (bpItems ?? []).forEach((it: any) => {
        const node = it.venue ?? it.event;
        if (!node) return;
        add(it.venue ? "venue" : "event", node.id, node.name ?? node.title, node.category, node.tags, node.description ?? "", node.rating, node.review_count);
      });
    }

    // ---- server selection (single asks + composer fallback) ----
    // Named-venue match (2b) is guaranteed first. Name-pattern junk (agencies,
    // trams, offices) is dropped even here, except an explicitly named forced pick.
    if (forced) pool.delete(forced.id);
    let poolList = Array.from(pool.values()).filter((c: any) => !BLACKLIST_NAME.test(String(c.title ?? "")));
    if (forced) poolList = [forced, ...poolList];
    if (poolList.length === 0) return json({ skipped: "no_candidates" });

    const sub = (c: any) => `${cap(c.category)} - ${CITY[market] ?? market}`;
    // Single ask: weighted-random over the top-K by quality (rating * ln(1+reviews))
    // so repeat asks vary; a forced/named pick always wins. Full-day fallback keeps
    // the ranked top-5.
    const wgt = (c: any) => (Number(c.rating) || 3.5) * (1 + Math.log(1 + (Number(c.reviewCount) || 0))) + 0.05;
    let selected: any[];
    if (fullDay) {
      selected = poolList.slice(0, 5);
    } else if (forced) {
      selected = [forced];
    } else {
      // Activity ask -> prefer do-things categories over food (repro: "things to do"
      // returned a restaurant). Fall back to the full pool if none qualify.
      const DO_CATS = new Set(["entertainment", "outdoor", "park", "sports", "culture", "landmark", "museum", "tourism"]);
      const doPool = activityAsk ? poolList.filter((c: any) => DO_CATS.has(String(c.category ?? ""))) : [];
      const base = doPool.length ? doPool : poolList;
      const topK = base.slice().sort((a, b) => wgt(b) - wgt(a)).slice(0, 6);
      selected = [weightedPick(topK.map((v) => ({ v, s: wgt(v) })))];
    }

    let payload: any;
    let venueIds: string[];
    if (fullDay && selected.length >= 2) {
      const items = selected.map((c, i) => ({ slot_title: SLOTS[Math.min(i, SLOTS.length - 1)], kind: c.kind, id: c.id, title: c.title, subtitle: sub(c) }));
      payload = { items };
      venueIds = items.map((it) => it.id);
    } else {
      const c = selected[0];
      payload = { kind: c.kind, id: c.id, title: c.title, subtitle: sub(c) };
      venueIds = [c.id];
    }

    // ---- narration only ----
    const rate = (c: any) => (c.rating != null ? `${c.rating}/5${c.reviewCount ? ` from ${c.reviewCount} reviews` : ""}` : "unrated");
    const selLines = selected.map((c, i) => `${i + 1}. "${c.title}" | ${c.category ?? "-"} | rating ${rate(c)} | ${c.note || "(no description)"}`).join("\n");
    const chatLog = recent.slice(-6).map((m) => `${m.is_ai_response ? "fixer" : "guest"}: ${m.body ?? ""}`).join("\n");
    const userContent =
      `Group ask: "${cleanTrigger}"\n\nRecent chat:\n${chatLog}\n\n` +
      `SELECTION (narrate ONLY these, in this order):\n${selLines}`;

    const names = selected.map((c) => c.title);
    let message = names.length > 1 ? `Here is a plan: ${names.join(", ")}.` : `Check out ${names[0]}.`;

    // Single suggestion must never narrate a full day (repro: a hotel narrated as
    // "breakfast, lunch and dinner without moving").
    const singleNote = selected.length === 1
      ? "\n\nThis is exactly ONE place. Recommend just this spot; do NOT describe a full day, several meals, or moving between stops."
      : "";
    const narrated = await narrateLLM(systemPrompt(market), userContent + singleNote);
    if (narrated) message = narrated;

    const { data: inserted, error: insErr } = await admin.from("trip_messages")
      .insert({ trip_id: tripId, user_id: null, is_ai_response: true, body: message, payload, venue_ids: venueIds })
      .select("id").single();
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);

    return json({ ok: true, message_id: inserted.id, has_payload: !!payload, selected: venueIds.length, forced: !!forced });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
