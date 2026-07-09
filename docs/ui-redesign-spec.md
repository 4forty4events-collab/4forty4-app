# 4Forty4 — App-Wide UI Redesign: Dark Cinematic, Photography-First

A full presentation-layer redesign. Read the HARD BOUNDARY first — it is the whole point.

===================================================================
HARD BOUNDARY — PRESENTATION LAYER ONLY
===================================================================
This pass changes SCREENS, COMPONENTS, STYLING, and NAVIGATION FEEL. Nothing else.

DO NOT touch: the coordination-ai-curator, the harvest / ingest-brightdata, the
geo-guard, RLS policies, any edge function logic, data models, Supabase queries,
TanStack Query hooks' data-fetching logic, or the Ask AI / Send routing. If a redesign
step seems to require a backend or query change, STOP and flag it instead of doing it.
Every screen keeps its exact current data source and behavior; only its visual layer changes.

Preserve all working functionality: Ask AI / Send buttons, itinerary manual editing,
add-to-trip, budget planner, discovery, saved/collections, profile, organizer portal,
safety directory. Restyle them; do not re-wire them.

===================================================================
DESIGN DIRECTION (approved)
===================================================================
Mood: DARK & CINEMATIC. Venue photography is the hero; the interface recedes so images
glow against a dark base. Reference feeling: a premium travel/editorial app, NOT a glassy
iOS-default and NOT the three AI-cliché looks (cream+terracotta serif / near-black+acid /
broadsheet hairlines). The point of view is Algiers: Mediterranean night, city lights,
warm local light as the single accent.

Languages: EN/FR primary, Arabic secondary and fully readable, but NO RTL layout flipping
(layout structure stays LTR-stable; this is deliberate, to avoid React Native RTL bugs).

## Token system (starting point — refine for polish, keep the intent)
Color (dark cinematic):
- `bg-base`    #0B1220  (deep Mediterranean night-blue, near-black but blue not gray)
- `bg-elevated`#131C2E  (cards / sheets, one step up from base)
- `text-hi`    #F2F4F8  (primary text on dark)
- `text-lo`    #9AA6B8  (secondary/caption)
- `accent`     #E8894A  (warm Algerian light — earthier/warmer than the AI-default
                         #D97757 on purpose; used sparingly for primary actions & active states)
- `accent-2`   #4FA3C7  (sea-blue, secondary highlights / links)
Use accent with restraint — one accent moment per screen, not scattered.

Type:
- Display face: a characterful face for venue names, screen titles, section headers —
  editorial weight, used LARGE and sparingly (pick something with personality, not the
  system default; must render Latin cleanly).
- Body face: clean, legible at small sizes for descriptions, metadata.
- Utility face: for captions, prices, category chips, data.
- Arabic: ensure the chosen faces (or a paired Arabic face) render Arabic text cleanly
  wherever it appears; do not break on Arabic venue names.
Set a clear type scale (e.g. 32/24/18/15/13) with intentional weights.

Motion (deliberate, minimal):
- Feed image parallax/scale on scroll (subtle).
- Fade/slide transitions between screens.
- Hover/press micro-states on cards.
- Respect reduced-motion. Do NOT over-animate — restraint reads as premium.

===================================================================
THE SIGNATURE ELEMENT — full-bleed discovery feed
===================================================================
The one memorable thing. The Discovery/Explore screen becomes a vertical, image-first,
swipeable feed:
- Each venue/event fills the screen edge-to-edge with its real photo (Cloudflare R2 image).
- A minimal bottom-gradient overlay carries: venue NAME (display face, large),
  ONE-LINE description (the real Google description from the harvest), a category chip,
  rating, and quick actions (save + add-to-trip).
- Double-tap = save (Instagram-familiar). Add-to-trip = the existing endpoint.
- Everything else on the screen stays quiet so the photo dominates.
This is where the boldness is spent. Keep the rest of the app disciplined around it.

===================================================================
SCREEN-BY-SCREEN (restyle only, same data & behavior)
===================================================================
1. Discovery/Explore → the full-bleed feed above (centerpiece).
2. Venue detail → magazine layout: full hero image, venue name over/under it in display
   face, the Google description as body copy, price + rating as utility type, "Add to trip"
   as the primary accent action. Gallery below.
3. Trip workspace → keep Ask AI / Send, itinerary tab, manual add/edit/delete/reorder
   EXACTLY as wired; restyle chat bubbles, day-plan cards, and the composer to the dark
   cinematic language. Day-plan venue cards get small thumbnail images.
4. Search → dark, fast, image-thumbnail results; keep existing search logic.
5. Saved / Collections → image-grid (Instagram-grid familiarity), dark base.
6. Profile & Settings → consistent type scale, dark, quiet.
7. Budget planner, organizer portal, safety directory, notifications → apply the shared
   visual language (colors, type, spacing, cards) without changing their logic.

===================================================================
PROCESS (per the design discipline)
===================================================================
1. First produce a compact design plan: finalized token values, chosen typefaces (name
   them), and 2–3 ASCII wireframes (feed, venue detail, trip workspace). Show me this
   BEFORE building screens, so we align on direction.
2. Build a shared theme/tokens module + reusable components (buttons, chips, cards,
   sheets, the feed item) FIRST, so every screen composes from the same system — this is
   the scalability requirement; no per-screen one-off styling.
3. Then restyle screens one at a time, verifying each still works (data loads, actions
   fire) before moving on. Validate existing functionality after each screen.
4. Quality floor: readable contrast on dark, visible focus states, reduced-motion
   respected, works down to small phones, no clipped chips (the known ScrollView bug:
   explicit height, contentContainerStyle padding).

===================================================================
ORDER
===================================================================
1. Design plan + tokens + shared components (show me the plan first).
2. Feed (signature) → venue detail → trip workspace → the rest.
3. Nothing backend. If a step needs backend, flag it, don't do it.
