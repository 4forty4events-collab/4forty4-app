# The Purday Design Bible

The standing reference for how Purday is built. From Stage 6 onward every feature is
designed and reviewed against this document.

It is not a style guide bolted onto finished work. Most of what follows was decided by
building Stages 1–5 and hitting the cases where a rule was needed — the precedents are
cited so the reasoning survives, not just the conclusion.

**How to use it:** before building, read §1–§3 and whichever surface sections apply.
Before shipping, run the checklist in §18. When this document and a request disagree,
say so and propose the version that honours both — that conversation is the process
working, not a blocker.

---

## 1. Core product philosophy

> **Purday is not a social network. It is a trusted, real-time exploration network where
> authentic experiences create meaningful connections.**

Four consequences that decide arguments:

1. **The goal is for people to leave the app.**

   > The purpose of Purday is not to maximise time spent in the app.
   > The purpose of Purday is to maximise **memorable time spent in the real world**.

   Success is a user out in the city, not a user scrolling. Never optimise for screen
   time. If a feature's success metric is "minutes in app", it is the wrong feature.

   This governs more than the feed. It decides AI behaviour (concise and actionable, not
   conversational for its own sake), notification policy (a reason to go somewhere, not a
   reason to open the app), social mechanics (no engagement loops that reward posting
   over going), and engineering trade-offs (spend the complexity budget on getting
   someone out of the door faster).
2. **Experiences create relationships.** Not the reverse. Every connection in Purday has
   an origin — a place, an outing, a shared plan.
3. **Reality outranks content.** What is happening now beats what performed well last
   week, always, structurally, not as a tiebreak.
4. **Everything displayed is earned.** No stat, badge, level or status may be
   self-declared, manually configured, or invented to make a screen feel better.

**The recognition test.** Someone sees Purday for five seconds, no logo. They should
know it isn't Instagram. That comes from the combination of dark cinematic surfaces,
editorial serif over clean sans, motion that only marks live things, and a feed that
answers *"what's happening around me right now?"* If a new screen would be
indistinguishable from a generic social app, it isn't finished.

### 1.1 The six pillars

Purday grows through **depth, not breadth**. Every feature must strengthen at least one
of these:

| Pillar | The user's moment |
|---|---|
| **Discover** | "Where should I go?" |
| **Plan** | "How do I turn that into a day?" |
| **Experience** | "I'm out, and I'm here now." |
| **Share** | "Here's what it was actually like." |
| **Connect** | "Who else is doing this?" |
| **Remember** | "That was one of the good ones." |

**A feature that reinforces none of them is reconsidered before implementation** — not
built and evaluated later. This is the first question in a product spec, not the last.

Two failure modes it exists to catch: a capability that is genuinely useful but belongs
in a different product, and a capability that adds surface area to a pillar already
served — breadth wearing depth's clothes. The honest answer is sometimes "this is a good
idea and not a Purday idea."

---

## 2. Experience-first social design

**People connect because they explored, not because they searched each other.**

- There is **no global Message button**. Anywhere. A profile is not an entry point to a
  stranger's inbox.
- A conversation always has an **origin** — "Ask about this experience", a story reply,
  a shared outing. The origin is stored on the row (`direct_messages.post_id` /
  `story_id`), not just implied by the UI.
- Cold, context-free messaging is **earned** through exploration, and the rule lives in
  the database (`enforce_explorer_chat`), not in a hidden button. A rule enforced only in
  the client is a suggestion.
- Anyone messaged first may always reply. Progression must never trap someone.

**Precedent:** Stage 5B. The gate resolves in order — contextual → existing thread →
earned status. That order is deliberate: the product path is never blocked, and the
politeness case is never sacrificed to the rule.

---

## 3. Trust over artificial engagement

**This is the section that matters most. Purday's entire value proposition is that what
you see is true.**

### 3.1 The prohibition

Never fabricate, in UI or data:

- progression currencies with no ledger behind them (**no XP**, no invented points)
- progress steps describing work the system is not doing
- counts, ratings, distances, or times not derived from real rows
- verification, endorsement, or presence that wasn't actually established
- placeholder social proof ("1.2k explorers") on an empty product

> **A progress bar narrating work nobody is doing is a forgery with better art
> direction.**

### 3.2 The two live precedents

**XP (rejected).** The verified-post celebration was asked to show "+XP earned". Purday
has no XP ledger. Instead the moment shows the server's verdict, the Passport level and
verified count re-read after the write, and the true statement that nearby explorers can
discover it. Level is derived from real work and moves when the work does.

**Clone steps (rewritten).** The clone animation was asked to say "Finding today's
availability… Checking nearby alternatives…". `clone_trip` does neither. The steps now
read *reading the blueprint / copying every stop / making it yours* — the real phases —
and the sheet waits for the server rather than completing on a timer. The component
comments record where an availability step would go **if that work ever becomes real**.

### 3.3 Claims must be server-adjudicated

When the product makes a claim on a user's behalf, the server decides and the client is
told the verdict.

- `create_experience_post()` measures proximity server-side. A client cannot mark its own
  post verified.
- A trigger forces `verification = 'unverified'` on every ordinary write.
- **The subject of a claim is frozen too, not just the verdict.** Freezing `verification`
  on update but leaving `venue_id` writable allowed a genuine verified post to be
  relocated to a nicer venue — a forged "Verified at". A verified row is immutable in
  every field that constitutes the claim.

**Rule:** when adding a field a badge depends on, ask *"can the owner edit this after the
badge is granted?"* If yes, freeze it.

### 3.4 Failure is stated, never disguised

A claim that doesn't check out is stored as what it actually is and the user is told.
"Shared as a Memory — we couldn't confirm you're at X" is the pattern: name what
happened, why, and that the content still shipped. Never silently downgrade.

### 3.5 Honest absence

An unavailable stat is **hidden**, not shown as `0`. A new explorer's Passport says
"Hasn't explored yet" rather than rendering a grid of noughts. Zero is a number; absence
is a different statement, and conflating them reads as failure.

---

## 4. Feed philosophy

The feed answers exactly one question: **"What's happening around me right now?"**
Not "what became popular last week?"

### 4.1 Liveness is a hard tier above engagement

```
live 0  ·  on the way 1  ·  just finished 2  ·  memory / blueprint 3
```

Engagement orders **within** a tier only. A verified live post from a stranger with zero
likes outranks a memory with five hundred. If engagement could promote across tiers, a
good photo from last month would push tonight's busy rooftop off the screen and the feed
would quietly become Instagram.

### 4.2 Claims decay

"Live now" is a claim about the present tense, so it cannot keep being true. Post state
decays with age (`resolveExperience`): live → just finished → memory. Decay is
one-directional — a post only ever gets less immediate — and it re-sorts the feed with no
writes. A verified post **keeps its verified mark** when it decays: we confirmed they
were there; only the tense expired.

Half-lives are per-tier (90 min for live, 36 h for memories) so the live edge actually
turns over.

### 4.3 What belongs

Only content that answers *"where should I go next?"* — places, outings, events, trips,
blueprints, hidden gems. No memes, no unrelated selfies, no motivational quotes.

### 4.4 Emptiness is honest

An empty pulse means the city is quiet. Say so and offer the fix. Never pad a feed with
fabricated activity to look alive.

---

## 5. Passport philosophy

A profile is a **Passport**, not a follower count. It answers *"how does this person
experience the world?"*

- Every figure is **derived server-side** from real rows. Nothing is typed in.
- Cities are **stamps** — collected by going there, not listed.
- Categories are collectible badges, ranked by actual behaviour.
- Streaks **break honestly**. A streak that survives a month of silence isn't a streak.
- Follower counts still exist but are **demoted** below the Passport.
- The same component renders for you and for others: what you see is what they see.

**Naming:** the object is the **Passport**. "Explorer" survives for the person and the
ladder — Explorer Level, Explorer Chat, explorer credits.

**Progression is framed as progress, never punishment.** "Complete one verified outing to
unlock Explorer Chat" — the app is asking you to go outside, not withholding a feature.
Once earned, say so plainly.

---

## 6. Badge philosophy

A badge is a **claim**, and its worth is exactly its scarcity plus its enforceability.

1. **Only one badge gets a solid fill.** Verified Live. Everything else is outlined. If
   every state shouts, none of them mean anything.
2. **Badges expire.** Nothing may go on insisting it's current a day later.
3. **A badge you can grant yourself is decoration.** If a client can produce it, it does
   not belong in this system.
4. **The default state has no badge.** A memory is the quiet baseline — an unbadged post
   is normal, not deficient.
5. **Words carry the meaning; glyphs are decoration.** Screen readers get "Live now,
   location verified", never "green circle".

---

## 7. Motion principles

> **Motion is a status light, not decoration.**

- **Only present-tense things move.** Live breathes (1400 ms in/out). On-the-way drifts
  sideways (2200 ms), as if travelling. Just-finished and memories are **completely
  still**. So a glance down the feed reads the city's activity without reading a word.
- **Motion stops by itself.** Because claims decay, a post stops animating when its claim
  expires. Nothing pulses at you forever.
- **Motion punctuates; it does not perform.** One moving element per screen region.
  Marquees, carousels that scroll themselves, and parallax-for-its-own-sake are out — a
  self-scrolling shelf was deliberately deleted during the Discover redesign.
- **Earned moments get one gesture.** The verified stamp presses and settles
  (`Easing.out(Easing.back)`), the like springs in on the way in and does nothing on the
  way out — un-liking should not be celebrated.
- **Durations** come from `motion` tokens: `fast 120` (state flips), `base 220`
  (transitions), `slow 360` (entrances). Loops are longer and gentler.
- **`useNativeDriver: true`**, always. Animate `opacity` and `transform` only.

### Reduce Motion is absolute

`useReducedMotion()` must be honoured by **every** animation. Not reduced — **static**.
Under Reduce Motion the screen must be fully legible and complete with nothing moving.
Verify by turning it on: if anything still moves, it's a bug.

---

## 8. Typography system

Two families, deliberately paired: **Fraunces** (editorial serif) for identity,
**Inter** for everything you read. That contrast is a large part of not looking like a
social app.

| Variant | Family | Size / line | Use |
|---|---|---|---|
| `display` | Fraunces Bold | 34 / 40 | Screen titles, hero |
| `title` | Fraunces SemiBold | 24 / 30 | Section titles, card headlines |
| `heading` | Fraunces SemiBold | 18 / 24 | Sub-sections, sheet titles |
| `bodyLg` | Inter Regular | 17 / 26 | Long-form reading |
| `body` | Inter Regular | 15 / 22 | Default |
| `bodyMed` / `bodySemi` | Inter 500 / 600 | 15 / 22 | Emphasis in body |
| `label` | Inter SemiBold | 13 / 18 | Buttons, metadata, chips |
| `caption` | Inter Bold | 11 / 14, +0.5 tracking | Eyebrows, badges, timestamps |
| `num` | Inter SemiBold, tabular | 14 | Any number that changes in place |

Rules:

- **Never** write `fontSize`/`fontFamily` ad hoc. Use `AppText variant=…`. Size overrides
  are allowed sparingly for hero type; families are not.
- **Uppercase + tracking is for eyebrows only** (`caption`): PASSPORT, LIVE AROUND YOU,
  CITIES EXPLORED. Never uppercase body copy.
- **Weight is not a family.** Each weight is its own loaded TTF; `fontWeight` is a no-op.
- **Arabic routes automatically** to IBM Plex Sans Arabic at matching weight via
  `fontForVariant`. Never hardcode a Latin family where user content renders.
- **Tabular numerals** for anything that ticks (timers, counters, clock columns) so digits
  don't jitter.

---

## 9. Color language

Dark is the only theme, by design — a cinematic night surface that lets photography lead.

**Surfaces.** `bgBase #0B1220` (deep Mediterranean night-blue — blue, never grey) →
`bgElevated #131C2E` → `bgElevated2 #1B2740`. **Elevation on dark reads as a border, not
a shadow**: use `line #1F2A3C` hairlines, not drop shadows.

**Text.** `textHi #F2F4F8` (~15:1) → `textLo #9AA6B8` (~6.3:1) → `textMute #6B7890`
(disabled/tertiary only — never for content someone must read).

**Accents, and the discipline around them.**

- `accent #E8894A` — warm Algerian light. **One accent moment per screen.** It marks the
  single most important action. Two primary buttons in view means one is wrong.
- `accent2 #4FA3C7` — sea-blue. Links, secondary highlights, contextual actions.
- `onAccent #0B1220` — always dark on a warm fill.

**Semantic, non-negotiable.** `danger #E5605E` destructive · `success #4FBE8F` ·
`star #F0B54A` ratings · **live green `#22C55E`** — reserved exclusively for verified
liveness. It must never be used for generic success, or the Live badge stops meaning
anything.

**Over photography** use `glass` + `glassBorder` pills and the three-stop scrim
(`scrimTop → scrimMid → scrimBottom`). Text on an image always sits on a scrim or a glass
pill — never raw.

**Category colours** come from `CATEGORY_COLORS`, used at low alpha for fills
(`${tint}1A`) and mid alpha for borders (`${tint}88`).

---

## 10. Design tokens and spacing rules

```
space   xs 4 · sm 8 · md 12 · base 16 · lg 20 · xl 24 · xxl 32 · huge 48
radius  sm 8 · md 12 · lg 16 · xl 22 · pill 999
motion  fast 120 · base 220 · slow 360
stroke  1.75  (every icon, no exceptions)
```

- **`space.base` (16) is the screen gutter.** Everything aligns to it.
- Prefer `gap` over margin chains.
- **Radius by role**, not by whim: `sm` tags/badges · `md` inputs, rows, list cards ·
  `lg` content cards, sheets · `xl` modals, feature cards · `pill` chips and buttons.
- **No magic numbers for rhythm.** A raw number is acceptable only for a fixed physical
  shape (a 76 px stamp circle, a 260 px cover) — never for spacing or corners.
- Icons: `Icon`/`NavIcons` at `strokeW 1.75`. Sizes cluster at 13/15/18/20/22 — pick the
  nearest, don't invent.

---

## 11. Interaction patterns

- **Touch targets ≥ 44 px.** Small glyph buttons carry `hitSlop={10}`.
- **Optimistic by default** for reversible actions (like, save, follow) — flip local
  state, fire, revert on error. Never spin a reversible action.
- **Confirm destructive and irreversible actions**, and name what happens: "Everyone on
  the roster will see it as CANCELLED."
- **Spending is explicit.** Anything that costs money or credits requires its own
  deliberate action and is never the default. Precedent: plain Send is free, the Ask AI
  pill spends, and Return defaults to free.
- **A refusal from the server is surfaced as guidance**, not a red error. `42501` from the
  chat gate becomes "Explorer Chat is locked — share a verified experience first."
- **Loading states scale to the wait.** Under ~300 ms show nothing. Beyond that, a
  skeleton in the shape of the content — not a centred spinner over a blank screen.
  Staged progress only when there are real stages (§3.2).
- **Never trap the user.** Every sheet dismisses on backdrop tap; every flow has a back.

---

## 12. Empty states

An empty state is the moment to send someone outside. Never a dead end, never the word
"None".

Four parts, always:

1. A glyph
2. What's true — *"Nobody is exploring nearby right now"*
3. Why it's fine / what would change it
4. **One action that fixes it** — *Start an outing*

Match the state to the cause: signed out, nothing followed, nothing live, and nothing at
all are four different situations with four different fixes. And never manufacture
content to avoid an empty state.

---

## 13. Micro-interactions

Subtle, intentional, never flashy. Each one confirms something real happened.

| Moment | Behaviour |
|---|---|
| Like | Heart fills, one spring in; nothing on un-like |
| Verified earned | Stamp presses and settles, then detail rises |
| City earned | Stamp appears on the Passport |
| Live badge | Slow breath while genuinely live |
| On-the-way badge | Gentle sideways drift |
| Clone | Steps complete in sequence, waiting on the server |
| Pulse | Halo expands from the live dot |

Rules: one per interaction; ≤ 400 ms unless it's a loop; never block input; always
static under Reduce Motion.

---

## 14. AI personality

Purday's AI is a **concierge who knows the city** — not a chatbot, not a hype man.

- **Warm, brief, specific.** It names real venues from the catalogue and says why.
- **It never invents a place, a price, an opening time, or an availability check.** If
  the data isn't there, it says what it doesn't know.
- **It proposes; the user decides.** Every suggestion is actionable — add this stop, add
  the day, save it — and nothing is committed on the user's behalf.
- **It is a guest in the conversation.** It speaks when asked (the explicit Ask AI
  action), not on every message.
- **Server owns selection.** The model picks from real scanned rows; the client renders
  the result. Precedent: the coordination curator refactor.
- **Cost is visible.** An AI action that spends is always a deliberate, separate tap.

Voice: *"Rooftop at Skyline, then dinner at Le Jardin — both walkable from where you'll
be."* Not: *"🎉 I found 3 AMAZING options for you!!"*

---

## 15. Privacy principles

- **Precise location is never persisted and never displayed.** Coordinates are consumed
  to compute a verdict or a distance, then discarded. The public sees a venue or area
  name — "📍 Skyline Rooftop", "Near Bab Ezzouar".
- **Compute on-device where possible.** Feed distance is calculated locally from the
  viewer's own position; it is never sent anywhere to render "450 m".
- **Presence is opt-in**, always, with a visible way out.
- **Coarse over precise.** "1.2 km", not "1,247 m" — false precision on an estimate is its
  own small dishonesty.
- **Raw analytics stay private** to the user (`content_views` is self-read only);
  aggregates surface, individual behaviour doesn't.
- Before adding a field, ask: *what's the worst thing someone could do with this if it
  leaked?* If the answer is "find a specific person", don't store it.

---

## 16. Accessibility rules

- **Reduce Motion is absolute** (§7). Every animation, no exceptions.
- **Contrast**: `textHi`/`textLo` on base surfaces meet AA. `textMute` is never used for
  content that must be read.
- **Every interactive element** has `accessibilityRole` and a meaningful
  `accessibilityLabel`. "Like" / "Unlike", not "heart".
- **Group compound content** with `accessible` and one spoken label — "12 verified
  experiences", not a number floating beside a truncated word. Decorative glyphs are
  never the label.
- **Targets ≥ 44 px**, `hitSlop` where the glyph is smaller.
- **Never colour alone.** The live badge is green *and* filled *and* says LIVE VERIFIED.
- **Text must scale** without clipping; test long venue names and long lists.
- RTL: Arabic renders in its own family; no layout flip (existing spec).

---

## 17. Performance standards

Explorer should feel instantaneous.

- **Key lists by identity, never by index.** An index-based key re-mounted every card
  below a re-ranked row — and this feed re-ranks on every like and every two minutes as
  liveness decays. This was a real bug; don't reintroduce it.
- **Memoize row components** on the props that actually change.
- **Images via `expo-image`** with `cachePolicy="memory-disk"`, a `recyclingKey`, and a
  transition. Never raw `Image` for remote content in a list.
- **Window long lists**: `initialNumToRender` / `maxToRenderPerBatch` / `windowSize` tuned
  to row height; `removeClippedSubviews` for tall rows.
- **Paginate** anything unbounded (keyset cursors, not offsets).
- **Batch reads**: resolve authors/places in one `in(...)` query, never N+1 per row.
- **Additive panels fail soft** — `retry: false`, render nothing on error, leave the
  screen working. A decorative panel must never break the page around it.
- **Don't poll in the background** (`refetchIntervalInBackground: false`).
- **Optimistic writes** for reversible actions.

---

## 18. Definition of done

A feature ships when all of these are true.

**Purpose**
- [ ] It strengthens at least one of the six pillars (§1.1), and you can say which.

**Truth**
- [ ] Every number, badge and label traces to a real row.
- [ ] No invented currency, progress step, or placeholder social proof.
- [ ] Any claim the product makes is adjudicated server-side and unforgeable from a client.
- [ ] Fields a badge depends on are frozen once granted.
- [ ] Failures are stated plainly; absent data is hidden, not zeroed.

**Feel**
- [ ] Only present-tense things move; everything is static under Reduce Motion.
- [ ] One accent moment per screen.
- [ ] Type comes from variants; spacing and radius from tokens.
- [ ] Every empty state names the situation and offers one action.

**Craft**
- [ ] Roles and labels on every interactive element; targets ≥ 44 px.
- [ ] Lists keyed by identity, rows memoized, images cached, queries batched.
- [ ] No coordinates persisted or displayed.
- [ ] Migrations note their apply order and dependencies.
- [ ] Verified on a device — a bundle check cannot judge how something feels.

---

## 19. Milestone lifecycle

Every milestone runs the same twelve stages, in order:

```
Research → Product Specification → User Journey Mapping → UX Flows → UI Design
→ Architecture → Implementation → Internal QA → Device Validation
→ Feature Freeze → Documentation → Milestone Closure
```

Three rules make it more than a list:

1. **Design precedes implementation.** No milestone code before a written specification
   and user journey. If a build request arrives without one, write the spec first — that
   is the work, not a delay to it.
2. **No stage skips validation.** Device Validation is not optional and not replaceable
   by tests. Bundle checks and unit assertions cannot judge how something feels, whether
   GPS verification fires at a real venue, or whether a layout survives a small screen.
3. **A frozen milestone stops accumulating.** After Feature Freeze the only permitted
   change is a fix for a failing acceptance item.

### Defect vs deferral

The distinction that keeps a baseline stable, applied during validation:

- **Defect** — an acceptance item that does not pass. Fix it, re-test, record it.
- **Deferral** — anything else: a nicer interaction, a cleaner abstraction, a missing
  capability, an improvement noticed in passing. **Write it down; do not build it.**

Deferrals are recorded, not resisted — good ideas found during validation must survive
without being smuggled into a frozen release. Every acceptance document carries a
deferral table for exactly this.

### Milestone closure

A milestone is tagged only after Device Validation passes in full. **The tag is a claim
that real hardware verified this**, so it can never be applied at implementation-complete.
The first is `Purday Explorer Platform — v1.0 Foundation` (Stage 5).

---

## 20. Evidence standard

§3 forbids fabricating what the product displays. This is the same rule applied one level
earlier — to what we claim to *know* before we build anything.

**A made-up insight is more dangerous than a made-up stat.** A fabricated number misleads
one user on one screen. A fabricated finding about user behaviour misdirects an entire
milestone, survives into the next specification, and six months later is indistinguishable
from something real. Research documents are where a product quietly starts lying to itself.

### The three categories, never blended

| | Means | May be used to |
|---|---|---|
| **Believed** | Reasoned from philosophy, design, or the shape of the product. | Frame questions. Never justify a build. |
| **Observed** | Seen once in real data or real behaviour. | Rank priorities. Support a case with its caveats attached. |
| **Validated** | Tested against evidence that could have refuted it, and survived. | Justify building something. |

A belief that has been repeated often does not become observed. An observation from three
people does not become validated. Movement between categories requires evidence, and the
document records when it happened.

### Three tests that catch a fact that isn't one

Most misclassification is not carelessness — it is a category error that reads as true.
Apply these before writing anything into a "known facts" section:

1. **A missing UI is not a missing domain model.** "We don't show outing progress" and
   "an outing cannot represent progress" are different sizes of problem by an order of
   magnitude. Check the schema, not the screen.
2. **Existing code is not a proven capability.** Something written, merged, and never
   deployed or exercised is not a capability you can build on. Ask what would have to be
   true for it to work in production today.
3. **A product belief is not validated user behaviour.** However well-reasoned, and
   however much has already been built on it, it stays an assumption until evidence that
   could have refuted it did not.

Each of these produced a real reclassification the first time §20 was applied.

### Rules for any research document

1. **Separate the sections**: known facts · assumptions · questions · hypotheses ·
   validation plan. An assumption printed next to a fact is how the two get confused.
2. **Facts are verifiable today** — implementation, technical constraints, or verified
   acceptance testing. If a fact came from acceptance testing, it does not exist until
   that testing has run. Say the section is empty rather than filling it.
3. **Assumptions are labelled as assumptions**, and the most load-bearing ones get a note
   saying what the product has already staked on them.
4. **Hypotheses must be disprovable.** "Users lose the most momentum between creating an
   outing and leaving home" can fail. "Users lose interest after planning" cannot.
5. **Every hypothesis states what would refute it, and what decision changes if it is
   false.** A hypothesis whose failure changes nothing was not worth testing.
6. **Every finding carries its source, date and sample size.** "We don't know" is a
   result; record it.
7. **Ask what people did, not what they would like.** Feature requests are not research,
   and enthusiasm for an idea is not validation of it.

### The evidence header — required on every feature proposal

**No design work begins until this is filled in.** It goes at the top of the proposal,
before the idea is described, so the evidence is read before the enthusiasm.

```markdown
## Evidence header

### Evidence status
- Known:    <verifiable today — schema, constraints, verified acceptance testing>
- Assumed:  <beliefs this proposal rests on, labelled as such>
- Unknown:  <what we would need to find out, and have not>

### Risk assessment
- Load-bearing assumption: <the one which, if false, invalidates most of this>
- Cheapest test:           <the smallest experiment that could refute it>
- Cost if we build first and it's false: <what gets thrown away>

### Success criteria
- Observable behaviour that means it worked: <real-world behaviour, not engagement>
- Outcome that means rethink or abandon:     <stated now, not rationalised later>

### Exit criteria
- Evidence under which we decide NOT to build this: <specific and falsifiable>
```

Notes on filling it in honestly:

- **Success is real-world behaviour**, per §1: more outings actually taken, more
  experiences genuinely had. Session length and taps are not success criteria in this
  product, and a proposal that offers them as evidence has answered the wrong question.
- **Name one load-bearing assumption, not five.** If everything is load-bearing, the
  proposal has not been thought through. If nothing is, it is being oversold.
- **Exit criteria are written before building, never after.** Written afterwards they are
  always satisfied.

> **Never start a milestone without knowing what evidence would convince you to stop.**

### Why this is worth the friction

Research that can only confirm existing beliefs is theatre with a longer feedback loop.
The test of this standard is whether it has ever caused us to *abandon or materially
change* something we wanted to build. If it never has, it is not being applied — it is
producing the appearance of rigour.

Evidence is valuable precisely when it changes our minds. A framework that only ever
agrees with us is costing time and buying nothing.

---

## Amending this document

It is meant to be argued with. When a feature genuinely needs an exception, change the
rule here in the same commit — with the reasoning, as the sections above do. A rule
silently broken in one screen is how products stop being one product.
