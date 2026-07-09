# Feature A — coordination-ai-curator acceptance tests

The curator now works one way: the **server** owns selection and existence; Claude
Haiku only **narrates** the chosen places. These tests lock that contract in. Run them
on-device against a real trip in a market with catalog data (DZ). All prompts use the
`/ai` prefix to force a run and bypass the cooldown.

## Tests

**(a) Named-venue injection.**
Prompt: `/ai I need dream parc on the list`
- Named-venue lookup only fires on a NAMED request (add/include/put/reserve/book/get me,
  or "on/to the list|plan|itinerary"). Otherwise it is general curation.
- Matches the LONGEST non-generic phrase first ("dream parc"), never a stray token.
  If that phrase matches a catalog venue, the card MUST feature it (forced in, first).
- If a multi-word named phrase has NO catalog hit, reply exactly one line
  ("Dream Parc isn't in the catalog yet.") and stop — never force-inject a partial
  token match ("Parc"), never invent a place, never fall through to a random venue.
- A single distinctive token that misses falls through to general curation.

**(b) No repeats across "more options".**
Prompt: `/ai explore more options`, sent three times consecutively.
- Across the three responses, ZERO venue is repeated.
- Enforced in code: every id offered is written to `trip_messages.venue_ids`, and the
  candidate pool subtracts every id seen in `venue_ids` across the last 10 messages.

**(c) Removal + exclusion.**
Prompt: `/ai remove chowai staifi` (use a stop actually on the itinerary).
- The matching `trip_items` row is deleted.
- A one-line system confirmation appears ("Removed <name> from the plan.").
- That venue does NOT reappear in later suggestions (its id is recorded in the
  confirmation message's `venue_ids`).
- The same path runs when a stop is deleted from the Itinerary tab (swipe or the x).
- **Removal of something NOT on the itinerary** (e.g. `/ai remove mrz games` when it
  was only ever suggested): reply exactly "Mrz Games isn't on your itinerary yet." and
  STOP. Never fall through to a venue suggestion.

**(d) No truncation.**
Every response ends on a complete sentence. Narration is 2-4 sentences, no mid-word
cutoff, no meta-commentary about the candidate pool.

**(e) Full-day triggers on natural phrasing.**
Prompts: `/ai I said for a day` and `/ai why you giving one place only`
- Both MUST produce a multi-stop day plan (3-5 ordered stops), not a single card,
  provided the pool has >= 2 eligible venues after exclusions.
- Driven by the widened `FULLDAY` regex plus the `MORE` quantity-complaint regex.
  Deterministic — no LLM intent classification.

## Composer tests (full-day composition)

Full-day asks route through the deterministic composer (day-shape templates, category
blacklist, occasion variants, proximity ordering, weighted-random selection). The LLM
still only narrates.

**(f) Occasion — birthday.** `/ai curate a birthday outing`
- Contains both food anchors (a lunch AND a dinner that are restaurant/cafe), a
  standout dinner (highest-rated available restaurant), no agency/transport/service
  stop, and narration references the birthday.

**(g) Occasion — romantic.** `/ai curate a romantic day`
- Zero arcade/gaming stops (romantic template excludes gaming entirely).

**(h) Variety.** `/ai curate a full day` twice consecutively
- <= 1 shared venue between the two plans (venue_ids exclusion + weighted-random),
  both plans satisfy all template rules.

**(i) Shape invariants** — inspect any ~10 generated plans:
- No two consecutive stops of the same category (food anchors excepted).
- Max one gaming/arcade stop unless the user explicitly asks for gaming.
- Zero blacklisted categories/name-patterns (travel agencies, trams, offices, banks…).

**(j) Geographic sanity.** Stops flow through the city (greedy nearest-neighbour by
`st_distance` around the market centroid) — no obvious cross-city teleports.

## Non-negotiable

Intent detection stays **regex only**. Do not reintroduce an LLM-based intent
classifier: putting the model back in a decision role is the exact failure Feature A
removed. The regex is intentionally dumb.

## Known limitations (data, not logic)

- Output quality is capped by the catalog. A thin, arcade/junk-heavy pool yields weak
  days (e.g. a travel agency or a tram stop surfaced as an "activity"). The fix is the
  activities harvest, not curator code.
- Exclusion now reads BOTH `payload` ids and `venue_ids` (union), so it is reliable
  on the full-day path and for pre-migration cards.
- **Multi-day is not built.** "2 day outing" renders as a single day plan whose
  narration may talk about "day one / day two". Known limitation, not in scope — do
  not mistake it for a bug.
- **One plan per ask.** Multiple occasions in one message ("full day, chill day,
  romantic day, plus a birthday") produce a SINGLE plan — the highest-priority
  occasion wins (pickTemplate order: birthday > romantic > chill > high-energy >
  activity > social > default). Expected, not a bug.

## Intent routing (front door)

**(p) "wholeday"/"fullday" (no space) route to the composer**, not the single path.
**(q) Activity asks steer to do-things.** "things to do", "activities", "games",
"superdope activities" prefer entertainment/outdoor over food (single AND full-day).
**(r) Repeat-correction escalates.** "I said …" folds the prior message's intent back
in (re-triggers full-day / activity from the earlier ask).
**(s) A single suggestion never narrates a full day** (no "breakfast, lunch and
dinner without moving" for one venue).
**(t) Every narration is <= 3 sentences**, cut on a sentence boundary — never
mid-word, on any path.
