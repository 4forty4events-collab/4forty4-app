# 4Forty4 — Activities Harvest (with descriptions) + Manual Itinerary Control

Two workstreams in one handoff. Both are approved. Read fully before starting.
Repo is ground truth; where this doc and the code disagree, the code wins — but implement the intent below.

Context: side-by-side testing against ChatGPT proved the gap is DATA, not the composer.
ChatGPT surfaced karting, paintball, escape rooms, bowling, jet-ski, rage rooms, cable car —
all ABSENT from our 680-venue catalog (our app correctly returned "isn't in the catalog yet").
The composer works; it just has nothing to compose from in the do-things categories.
Also: ChatGPT plans read rich because every venue carries a description. Ours mostly don't.

So: (1) harvest the missing activity categories AND their descriptions, and
(2) make the trip itinerary fully human-editable, not AI-only.

===================================================================
WORKSTREAM 1 — ACTIVITIES HARVEST (Tier 1) + DESCRIPTIONS
===================================================================

Reuse the existing grid-harvester architecture (Bright Data async trigger-poll-fetch,
two-step discovery -> place_id enrichment, sector-state resume, credit caps,
dedup on google_place_id, ingest-time category rejection). This is WHAT to harvest.

## 1.1 Target categories (the proven-missing do-things set)

Run keyword-first WIDE passes (one Bright Data discovery job per keyword over the
Algiers bounding box — these are sparse, they do NOT need grid subdivision):

- karting  ("karting", "go kart", "kart racing")
- paintball ("paintball")
- laser tag ("laser game", "laser tag")
- escape rooms ("escape game", "escape room", "jeu d'evasion")
- bowling ("bowling")
- rage rooms ("rage room")
- trampoline / adventure parks ("trampoline park", "parc aventure", "accrobranche")
- pools / water parks ("piscine", "parc aquatique")
- beaches ("plage") — coastal bounding box Zeralda -> center -> Ain Taya
- parks & gardens ("parc", "jardin", "foret")
- hammams & spas ("hammam", "spa")
- viewpoints / promenades ("point de vue", "corniche", "promenade")
- jet ski / nautical ("jet ski", "club nautique")
- cable car / telepherique ("telepherique")

French-first (dominant on Google Maps Algeria), Arabic second where natural.
Keep the file pure ASCII for deploy (build Arabic/accented keywords via
String.fromCharCode or escape sequences — the ingest-brightdata ASCII panic rule).

## 1.2 DESCRIPTIONS — capture in the same pass (high priority, user-requested)

For EVERY venue (new harvest AND, where cheap, existing rows lacking one):
- In the place_id enrichment step, capture Google's editorial summary / description /
  "about" text / review-derived summary — whatever the Bright Data place payload exposes
  as descriptive text — into the venues.description field.
- Also capture: category/type tags, opening hours if present, price level if present.
- Do NOT LLM-generate descriptions in this pass. Real Google text only. If a venue has
  no description available, leave it null (a later optional pass can generate + flag).
- This description is what renders on the venue detail screen ("when I open a place I get
  a brief description") AND what feeds the curator's narration so plans read richer.

Confirm venues.description exists and is surfaced on the venue detail screen; if the
detail screen doesn't yet render description, wire it in (simple display, below title).

## 1.3 Ingest-time category mapping + junk rejection (already partly built — verify)

- karting/paintball/laser/escape/bowling/rage/trampoline -> entertainment
- pool/waterpark/beach/park/garden/viewpoint/promenade -> outdoor
- hammam/spa -> wellness
- jet ski/nautical/cable car -> outdoor (or a "sports" tag if that reads better)
- travel_agency/transport/tram/taxi/bank/office/pharmacy/government -> REJECT at ingest
  (do not insert; log the count). Confirm the existing REJECT set covers these.
- ambiguous types -> insert with needs_review = true, never guess.

## 1.4 Pricing (so the budget planner can use activities)

- Category-default DZD price level x existing neighborhood multiplier; price_estimated = true.
- Free venues (beaches, public parks, promenades, viewpoints): explicit price_type 'free',
  NOT null (null hides them from the budget planner; 'free' lets it use them).
- Never overwrite a real (menu-OCR or manual) price on re-harvest — preserve on null.

## 1.5 Budget & execution discipline (CRITICAL — real money)

- Confirm remaining Bright Data credit before triggering (user reports ~4027/5000).
- Tier 1 estimate ~300-600 credits. REPORT THE EXECUTION PLAN (keywords, sector count,
  est. credits) BEFORE triggering any paid job. User taps Start / gives explicit go.
- Reuse sector-state resume + hard venue cap. Suggested cap this run: 200.
- After the run, REPORT per category: venues added, rejects, needs_review, descriptions captured.

## 1.6 Harvest acceptance

- (k) "/ai I need karting, paintball, treasure hunts and intense activities on the list"
  -> returns REAL cards (not "isn't in the catalog yet"). This exact prompt failed pre-harvest.
- (l) Catalog now contains: karting >= 3, escape rooms >= 3, bowling >= 3, beaches >= 8,
  wellness >= 8, non-arcade entertainment >= 15.
- (m) A venue detail screen shows a real Google description.
- (n) Zero travel-agency/transport rows added (ingest reject working).
- (o) "/ai curate a full day with intense activities" -> plan includes at least one
  karting/escape/bowling/paintball venue that did not exist pre-harvest.

===================================================================
WORKSTREAM 2 — MANUAL ITINERARY CONTROL (AI + human input)
===================================================================

Goal: the trip itinerary must be fully human-editable, not only AI-curated. The user
must be able to build and edit a plan by hand, browsing their own categories/venues,
AND have AI contributions be editable/removable. Both inputs coexist on one itinerary.

## 2.1 Add-from-catalog (curate while browsing) — the core request

- On discovery/venue cards (Explore, Search, category browse, venue detail), add an
  "Add to trip" action.
- Tapping it opens a picker of the user's active/editable trips -> on select, inserts that
  venue into that trip's itinerary via the SAME insert path the chat curator uses
  (trip_items). Assign a sensible default slot/time or append to end; user can reorder later.
- Result: user can scroll their categories, find a place, and add it to an itinerary they
  created by hand — no AI required.

## 2.2 Manual add / edit / delete on the Itinerary tab

- Each itinerary item: swipe-to-delete or the x (already built for the chat-removal path —
  reuse remove_trip_item). Confirm it works for manually-added items too.
- Add a manual "+ Add stop" on the Itinerary tab -> opens category/venue browser ->
  select -> inserts (same path as 2.1).
- Allow editing an item's slot/label/time (morning/lunch/etc.) and reordering stops.
- All of this is deterministic CRUD on trip_items. No LLM involved in manual edits.

## 2.3 Admin: delete an entire plan

- As admin (is_admin() gate), be able to delete a whole trip/itinerary, not just single
  items. FK-safe: remove trip_items, trip_messages, participants rows, then the trip —
  mirror the FK-safe venue-delete pattern already in the Curation Toolkit.
- Surface this in the admin toolkit or the trip screen behind the admin gate.

## 2.4 Auto-clear past plans (lifecycle)

- When a plan's date/day has passed, it should leave the active itinerary list and move to
  an archived/past state (mirror the existing past-events auto-archive pattern).
- If trips/itineraries don't yet carry a date, add a nullable plan_date (or reuse an
  existing date field); items/plans with plan_date < today auto-archive.
- Past plans are hidden from the active list but retained (archived), not hard-deleted,
  unless the admin explicitly deletes them (2.3).

## 2.5 Manual-control acceptance

- (p) From a venue card outside chat, "Add to trip" -> pick a trip -> venue appears on that
  trip's itinerary.
- (q) On the Itinerary tab, manually add a stop from category browse, reorder it, delete it —
  all without any /ai command.
- (r) Admin can delete an entire plan; all child rows go, no FK errors.
- (s) A plan dated before today no longer shows in the active list (archived), and is
  restorable/visible in a past/archived view.
- (t) An AI-suggested stop the user dislikes can be removed by hand and stays gone
  (joins the existing exclusion set).

===================================================================
ORDER OF EXECUTION
===================================================================
1. Workstream 1 first (harvest + descriptions) — it's the data gap blocking plan quality,
   and it's gated on a paid run the user must approve. Report the credit plan, get go, run,
   report results, verify k-o.
2. Then Workstream 2 (manual control) — pure app/DB work, no credits. Verify p-t.

Deploy edge functions with --no-verify-jwt as before. Keep ingest-brightdata pure ASCII.
Report back after each workstream with acceptance results (or wherever it got stuck).
