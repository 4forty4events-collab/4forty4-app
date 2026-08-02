# Stage 5 acceptance — Experience Layer & Passport

Everything below needs a **physical device or simulator**. Bundle checks and the logic
tests in this repo cover ranking, decay and badge rules; they cannot tell you how the
feed *feels*, whether the GPS verification actually fires at a real venue, or whether a
layout survives a small screen.

**Status: not yet verified.** Stage 5 is feature-complete and frozen; this checklist is
the only thing between it and Production Complete.

## How this validation runs

**Stage 5 is frozen.** During validation the only permitted code change is a fix for an
item on this list that demonstrably fails.

- A **defect** is an acceptance item that does not pass. Fix it, note it below, re-test.
- Anything else — a nicer interaction, a cleaner abstraction, a missing feature, an
  improvement noticed in passing — is **deferred to a future milestone**, written down,
  not built. Refinements that arrive during validation are how a frozen baseline stops
  being a baseline.
- Migration order (§0) is fixed. Do not reorder it unless the dependencies are
  deliberately redesigned, which is a Stage 6 decision, not a validation one.

**On completion.** When every item passes, the milestone is tagged:

```
Purday Explorer Platform — v1.0 Foundation
```

That tag is the claim that this was verified on real hardware, so it is applied *after*
the last item passes — never on implementation-complete.

### Results

Record outcomes here as you go, so a re-run knows what was already covered.

| Section | Result | Notes / defects raised |
|---|---|---|
| 0. Migrations applied | **PASS** 2026-08-02 | All four applied in order. 10/10 schema checks pass against the live DB (columns + RPCs). One defect found and fixed: `explorer_passport` threw 42883 (`date - bigint`) on every call — `row_number()` is bigint and needs an explicit cast; fixed in `7bf8d65`, file re-run. Would not have been visible in the app: the panel fails soft and reads as "no data yet". |
| 1. Experience types | | |
| 2. Live verification + forgery | | |
| 3. Feed ranking | | |
| 4. Passport | | |
| 5. Messaging | | |
| 6. Trip fields | | |
| 7. Polish / motion / a11y | | |
| 8. Privacy | | |
| 9. Clean launch | | |

**Deferred to a future milestone** (found during validation, not defects):

| Observation | Why deferred |
|---|---|
| | |

---

## 0. Prerequisites — apply migrations IN THIS ORDER

Via the **Supabase SQL editor**. Never `db push` — the migration history is desynced and
a push would re-apply the 2026-07-09 batch to production.

| # | File | Adds |
|---|------|------|
| 1 | `20260722120000_blueprints.sql` | `clone_count`, `rating_avg`, `list_blueprints` |
| 2 | `20260722130000_trip_fields.sql` | trip `budget` / `currency` / `status`, `trip_items.start_time` |
| 3 | `20260801120000_experience_posts.sql` | `posts.experience_type` / `verification`, `create_experience_post`, `live_pulse` |
| 4 | `20260801130000_explorer_passport.sql` | `explorer_passport`, `explorer_credits`, chat gate, `direct_messages.post_id` |

Order matters: #4 reads `clone_count` from #1 and `posts.verification` from #3, and will
fail outright without them.

**Until #3 is applied, posting is broken** — the composer calls `create_experience_post`,
which won't exist. That's deliberate (fail loudly on a write path). The Passport and Live
Pulse panels fail *soft* — they render nothing and leave the screen working.

After applying, confirm no schema drift:

```sql
select column_name from information_schema.columns
 where table_name = 'posts' and column_name in
 ('experience_type','verification','verified_at','place_label','trip_id');   -- expect 5 rows

select proname from pg_proc
 where proname in ('create_experience_post','live_pulse','explorer_passport','explorer_credits');
```

---

## 1. Experience types — create one of each

| Type | Expected |
|---|---|
| 🚍 On My Way | Requires a place. Posts with an ON MY WAY badge. |
| 📍 Live Now | Requires a place **and** location. See §2. |
| ✅ Just Finished | No place required. JUST FINISHED badge. |
| 📖 Memory | Default. **No badge at all** — the quiet baseline. |
| 🗺 Blueprint | Not reachable from the photo composer; the schema supports it (`posts.trip_id`) but no compose entry point ships in 5A. See "Known gaps". |

Also check: a post with **only text and no photo** is allowed (an "on my way" often has
no picture yet), and the Share button stays disabled until there's a photo or words.

## 2. Live verification — the one that matters

- **At a venue** (within 250 m): post as Live Now → green **LIVE VERIFIED** pill, and the
  place line reads *"Verified at {venue}"*.
- **Away from the venue**: post as Live Now → you should get the *"Shared as a Memory"*
  alert naming the venue, and the post appears with **no** Live badge. It must not
  silently downgrade.
- **Location permission denied**: the composer hint says it will post as a Memory
  *before* you submit.
- **Airplane mode / no fix**: same fallback, no crash, no hang.
- Leave a verified Live post for **3+ hours**, then reopen the feed: the badge should have
  decayed to JUST FINISHED while keeping its verified mark. (Or shift the device clock.)

**Forgery checks** — the badge is worthless if a client can mint it. Run all four as a
normal signed-in user (SQL editor with the `authenticated` role, or the client).

```sql
-- 1. Mint a verified post outright        -> lands as 'unverified'
insert into posts (user_id, body, verification) values (auth.uid(), 'fake', 'verified');

-- 2. Promote your own post after the fact  -> both fields unchanged
update posts set verification = 'verified', experience_type = 'live' where user_id = auth.uid();

-- 3. RELOCATE a genuinely verified post    -> venue_id unchanged
--    Post a real verified Live somewhere, then try to move it to a nicer venue.
--    If this succeeded the card would read "Verified at <somewhere you have never been>".
update posts set venue_id = '<other-venue-uuid>'
 where user_id = auth.uid() and verification = 'verified';

-- 4. Same via the free-text label          -> place_label unchanged
update posts set place_label = 'Skyline Rooftop' where user_id = auth.uid();
```

Then confirm the badge **survives** normal activity: like one of your own verified posts
and check it still reads LIVE VERIFIED (the rollup triggers UPDATE `posts`).

Checks 1 and 2 fail loudly if the guard is missing. Checks 3 and 4 are the subtle pair —
they only matter *because* the guard preserves verification on update, so a stale copy of
the migration that freezes the verdict but not the subject will pass 1, 2 and the
like-survival check while still allowing a forged "Verified at". Editing a caption must
still work.

## 3. Feed ranking

With a mix on screen, confirm the order is always:

1. Verified Live
2. On My Way
3. Just Finished
4. Memories

**regardless of engagement** — a memory with hundreds of likes must sit below a live post
with none. (Automated: `live > on_the_way > just_finished > memory` is asserted in the
repo's ranking tests, but confirm it visually with real rows.)

Live Pulse: posts a live experience → count increments within ~2 min. Hides itself
entirely when nothing is live. The Live pill shows only present-tense posts and offers
"Be the first" when empty.

## 4. Passport

- Every figure traces to real activity. Nothing fabricated.
- Stats with no data are **hidden**, not shown as `0`.
- A brand-new account reads *"Hasn't explored yet"* rather than a grid of zeroes.
- Check each: Explorer Level · Verified Experiences · Cities Explored · Favorite
  Categories · Exploration Streak · Public Blueprints · Helpful Replies · Trusted By.
- Streak breaks correctly: no post for 2+ weeks → streak disappears.
- Your own Profile tab shows the same Passport plus the progression ladder.

## 5. Messaging

- **No Message button** exists on any profile.
- "Ask about this experience" on someone else's post opens a thread with the origin bar
  and a seeded question. On a live post it reads *"Ask how it is right now"*.
- The reply continues in the same thread; only the **first** message carries `post_id`.
- Cold DM, from an account with **zero** credits, must be refused by the database:

```sql
insert into direct_messages (sender_id, recipient_id, body)
values (auth.uid(), '<stranger-uuid>', 'hey');   -- expect 42501
```

  In-app this surfaces as the "Explorer Chat is locked" line, not a red error.
- Earn one credit (verified experience, or be on a trip whose date has passed) → the same
  cold DM now succeeds, and the ladder ticks over.
- Someone messages you first → you can always reply, even at zero credits.

## 6. Trip fields

Budget bar (cards + detail) · timeline clock column (only on days with a timed stop) ·
TONIGHT badge (today + first stop ≥ 17:00) · CANCELLED badge and dimmed card · restore.
**Event stops must contribute to the budget**, not just venues. Check for layout
regressions on the Outings list and detail.

## 7. Polish

Typography hierarchy · card spacing · badge consistency · animations · dark surfaces ·
small and large screens · VoiceOver/TalkBack on the Live Pulse card, experience pills,
Passport stats and the unlock rows · long venue names and 4+ cities without overflow.

**Motion is a status light** — check it reads that way:

- A live badge breathes; an on-the-way badge drifts sideways; just-finished and memory
  badges are **completely still**. If everything moves, the signal is gone.
- Leave a live post past its 3h window — it should stop animating by itself.
- **Reduce Motion on**: the Live Pulse halo, both badge animations, the verified stamp,
  the like spring and the clone stepper all go static. Nothing should still be moving.

**The two honesty moments** — these are the ones to watch closely:

- Post a verified Live → stamp confirmation showing level, verified count and cities.
  Every number must match the Passport when you open it. There is **no XP** anywhere; if
  you see an XP counter, something regressed.
- Clone a blueprint → the steps read *reading the blueprint / copying every stop / making
  it yours*. They must **not** claim to check availability or find alternatives — nothing
  in `clone_trip` does either. The sheet must not complete before the server answers
  (throttle the network and confirm it waits).

**Distance** (new on cards): with location granted, confirm the distance line is
plausible for a venue you know, that it reads "right here" under 100 m, and that walking
time only appears for genuinely walkable posts. With location denied, the line simply
omits distance rather than showing zero.

**Feed performance**: scroll a long feed, then like a card near the bottom. Only that
card should re-render — nothing above it should flicker or reload its image. (The old
index-based key remounted every row below a re-ranked one.)

## 8. Privacy

Confirm no surface anywhere prints coordinates. Audited in code — `lat`/`lng` appear only
as outbound RPC arguments in `postsRepository`/`hooks`, never in a component — but confirm
visually on the feed card, hero card, Passport and DM origin bar.

## 9. Clean launch

Fresh install → sign in → no red-box, no console errors, no unhandled rejections. Confirm
old posts created before the migration still render (they default to `memory` /
`unverified`).

---

## Known gaps — deliberately not built in Stage 5

Not defects; scope calls, listed so verification doesn't hunt for them.

- **Blueprint post type** — schema and RPC support it; no compose entry point.
- **Destination rooms**, temporary meetup groups, presence status ("🟢 Exploring now"),
  AI explorer introductions.
- **"Plan together"** for mutual explorers — needs an invite flow worth building properly.
- Anti-fake signals beyond distance: dwell time near the venue, movement toward it,
  in-app capture. Current rule is proximity at post time only.
- Stages 6–10: live outing mode, memory mode, blueprint marketplace, AI auto-designed
  covers, mood-based hero gradients.

## Pre-existing finding

`harvest_runs` (admin harvester) is read by `HarvestScreen` but has no definition in
`supabase/migrations` — it was applied out-of-band. Unrelated to Stage 5, flagged during
the schema audit.
