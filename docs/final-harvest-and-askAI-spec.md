# 4Forty4 — Final Harvest Decision (revert to grid) + Ask-AI Button

Two decisions, both final. Repo is ground truth; implement the intent below.

===================================================================
DECISION 1 — REVERT THE HARVEST TO THE GRID METHOD
===================================================================

## Why (context for whoever implements)
The tiered keyword harvest (T1/T2/T3: one wide Bright Data discovery job per keyword
over the whole Algiers bbox) was the WRONG design and is being retired. Evidence:
- Sparse keywords ("karting", "go kart") rank GLOBALLY, so wide passes returned
  ~83% foreign venues (Spain/Morocco/USA/etc.) and required a geo-guard just to survive.
- Worse, a single wide keyword pass returns only the top-ranked few and DROPS the rest:
  it kept one Tipaza karting and MISSED the known Chéraga and Bordj El Kiffan karting
  tracks entirely. That is the core failure — wide keyword search does not achieve
  local coverage.

The ORIGINAL grid harvester already worked: broad category sweeps over small
neighborhood SECTORS pulled ~500 good venues the first time, INCLUDING escape rooms
and rage rooms, WITHOUT a per-keyword search — because it swept each neighborhood and
took whatever Google had there. That is the method to use.

## What to do
1. Retire the T1/T2/T3 tier modes from the Harvest screen (or leave the code but default
   OFF). The active harvest mode is the GRID sweep, same as the original ~500-venue run.
2. Run the grid harvester across ALL Algiers neighborhood sectors again to pull the next
   batch (~500 target), using broad category terms per sector — NOT narrow global keywords.
   This will naturally surface the neighborhood karting/escape/rage/bowling venues that
   the keyword method missed (Chéraga, Bordj El Kiffan, Birkhadem, etc.).
3. KEEP the geo-guard exactly as fixed: reject if coordinates fall outside the Algeria
   bbox OR the address country != Algeria (either condition rejects; address-country
   checked always, end-anchored). Grid + geo-guard = broad local coverage with foreign
   rejection. This stays regardless of harvest method.
4. KEEP descriptions-at-discovery (capture Google editorial description/hours in the
   place_id enrichment step, preserve-on-null). Rides along with grid harvesting.
5. KEEP ingest-time category mapping + junk-reject (agencies/transport/etc.).

## Execution discipline
- Confirm remaining Bright Data credit and report the sector count + est. credits
  BEFORE the paid run. User taps Start (admin JWT).
- After the run, report: venues added, geo-rejected count (must be > 0 near borders),
  junk-rejected count, descriptions captured, and per-category counts.

## Acceptance
- (a) Catalog gains a batch of genuinely Algerian venues; spot-check 5 detail pages —
  every address ends "…, Algeria".
- (b) Known neighborhood venues appear: e.g. Chéraga karting AND Bordj El Kiffan karting
  both present (the two the keyword method missed).
- (c) geo-rejected count > 0 in the run log (border-overlap foreign venues caught live).
- (d) Zero foreign venues in a post-run country audit.
- (e) A venue detail page shows a real Google description.

===================================================================
DECISION 2 — REPLACE "/ai" SLASH COMMAND WITH AN "ASK AI" BUTTON
===================================================================

## Why
Typing "/ai ..." is fragile UX for a real first-time user — easy to forget, easy to
mistype, invisible as a feature. Replace it with an explicit button.

## What to do
- In the trip chat composer, next to the existing Send button, add a second action:
  **"Ask AI"** (or a robot icon).
  - **Send** → posts a normal group chat message (no curator call), as today.
  - **Ask AI** → routes the composer text to `coordination-ai-curator` exactly as
    "/ai <text>" does now, but WITHOUT requiring the "/ai" prefix.
- Strip the "/ai" parsing requirement from the curator trigger path: the Ask AI button
  is now the entry point. (Optionally still accept a typed "/ai" for backward compat,
  but it must no longer be the primary/only way in.)
- Everything downstream (intent gate, composer, narration) is unchanged — only the
  ENTRY POINT changes from a parsed prefix to a button.

## Acceptance
- (f) Typing "curate a full day" and tapping **Ask AI** → returns a day plan (no "/ai"
  needed).
- (g) Typing a normal message and tapping **Send** → posts to group chat, no curator call.
- (h) The two actions are visually distinct in the composer.

===================================================================
ORDER
===================================================================
1. Ask-AI button first (pure app work, no credits, immediately testable).
2. Then the grid harvest revert + run (paid; report plan, get go, run, verify a-e).
Deploy edge functions --no-verify-jwt. Keep ingest-brightdata pure ASCII.
