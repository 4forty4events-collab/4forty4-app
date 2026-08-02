# Stage 6 — Research brief

Lifecycle stage 1 of 12 (Design Bible §19). Nothing here authorises code. Stage 6
implementation is gated on Stage 5 passing hardware validation.

---

## 0. The evidence standard

Three categories, never blended (Design Bible §20):

| | Means | Section |
|---|---|---|
| **Believed** | Reasoned from philosophy or design. Could be wrong. | §2 Assumptions |
| **Observed** | Seen in real data or real behaviour, once. | §6 findings log |
| **Validated** | Tested against evidence that could have refuted it. | §5 outcomes |

**This document currently contains no observed or validated findings.** Everything below
is a fact about our own code, an assumption, a question, or an untested hypothesis.

Fabricated research is more dangerous than any fabricated UI. A made-up stat misleads one
user; a made-up insight about where momentum drops misdirects a whole milestone — and six
months later nobody can distinguish a confident invented finding from a real one. Every
future entry carries its source, its date, and its sample size. "We don't know" is a valid
answer and must be recorded as one.

---

## 1. Known facts

Established, not believed. Each is verifiable today.

### 1.1 From implementation *(verified against the codebase, 2026-08-02)*

- **An outing has no notion of being underway.** `collaborative_trips.status` accepts
  exactly `active` and `cancelled`. There is no started, in-progress or completed state,
  and nothing marks an outing as having happened other than its date passing.
- **No stop can be completed.** `trip_items` carries an optional `start_time` and no
  completion field. The itinerary cannot represent progress through itself.
- **Nothing is generated after an outing ends.** `feedback_prompt` exists only as an
  allowed value in the `notifications` type constraint; no function emits it.
  `run-schedulers` runs exactly one generator — event reminders for saved events starting
  within 24 hours.
- **Past outings are a label, not a feature.** Trips are split active/past purely by date
  and past ones render under "MEMORIES" with no behaviour attached.
- **Stage 5 added a live *post*, not a live *outing*.** `experience_type` lives on
  `posts`; nothing connects a live post to a trip being underway.
- **The app is location-aware but not location-active.** Coordinates are read on demand
  (verification, distance); there is no background location, geofencing or arrival
  detection, and adding any would be a significant new capability, not a refinement.

### 1.2 Technical constraints

- **Push delivery is unproven.** `deliver-push` and `run-schedulers` exist as code; cron,
  FCM/APNs credentials and a dev build are required, and none is confirmed working.
  Any Stage 6 concept depending on a timely notification depends on this first.
- **Background execution is not set up.** Expo Go cannot run background location or tasks;
  anything in that direction requires a dev build.
- **The catalogue is uneven.** Coverage is strong for some categories and thin for others,
  so low engagement with a category may reflect missing data rather than low interest.
  This confounds every behavioural query below.
- Migration history is desynced — schema changes apply via the SQL editor, in order.

### 1.3 From verified acceptance testing

**None yet.** Stage 5 has not been validated on hardware. This section stays empty until
`docs/stage5-acceptance.md` is complete, and it is the only place device-verified facts
may be recorded.

---

## 2. Product assumptions

**Beliefs, not conclusions.** Reasoned from product philosophy and the shape of the
product. Each may turn out to be wrong, and several are the kind of thing teams defend
long after the evidence has arrived.

- **A1** — People want the app to stay useful once they leave home. *(It may be that the
  right behaviour is silence, and that a companion is an intrusion on a night out.)*
- **A2** — An outing is a group activity; the interesting moments are shared, not solo.
- **A3** — People want to keep something after an outing, beyond what they posted publicly.
- **A4** — A good outing is worth repeating and worth passing on — the Blueprint premise.
- **A5** — Verified presence is more trustworthy to readers than an unverified post.
  ⚠️ **Highest-risk assumption in the product.** The Experience Feed, Live Verification,
  Passport credibility and experience-earned messaging all rest on it, and it has never
  been tested with a user. Promoted to **H7** and validated first (§5).
- **A6** — Momentum is lost at transitions rather than inside phases.
- **A7** — People will not do meaningful manual capture during an outing; whatever we ask
  for after the fact must be nearly free.

---

## 3. Research questions

Open questions for real users. Framed around the arc of an outing:

```
Inspiration → Planning → Commitment → Anticipation → Travel → Arrival
→ Experience → Transition → Reflection → Memory → Re-discovery
```

**Momentum**
1. Where does momentum drop between planning an outing and physically leaving home?
2. When during an outing do people stop interacting with Purday — and is that a failure or
   the product working as intended?
3. Which phases do people currently run in other tools, and which in no tool at all?

**In the moment**
4. What information do people look for while travelling to an outing?
5. What actually goes wrong mid-outing, and what do people do about it now?
6. Who is holding the phone during a group outing, and why?

**Afterwards**
7. What do people wish they had immediately after an outing ends?
8. What do they keep, and where does it currently live?
9. What would bring someone back to an outing months later?

**Feeling**
10. Which moments create delight?
11. Which moments create friction?
12. What would make someone recommend Purday to a friend — in their words?

---

## 4. Hypotheses

Each written so it can be **disproved**. All are untested and derived from the product's
structure, not from users.

- **H1** — Users experience the largest loss of momentum between creating an outing and
  physically leaving for the destination.
- **H2** — Group coordination moves off Purday at the moment the outing begins.
- **H3** — Plans fail on contact with reality (closure, lateness, weather) and users
  abandon rather than adapt them.
- **H4** — Nothing closes the loop after an outing, and users would value a prompt within
  24 hours of it ending.
- **H5** — The artefacts users most want to keep are captured during the outing but stored
  outside Purday.
- **H6** — Users would turn a completed outing into a Blueprint if asked at the right
  moment, and will not seek out the option unprompted.
- **H7** — Readers trust and act on a verified live post more than an equivalent
  unverified one. *(Promotes A5. Validated first — see below.)*

**Validation order.** H7 goes first, ahead of the momentum work. It is not the most
interesting question; it is the one already load-bearing. H1–H6 shape what we build next,
but H7 tests what we have already built, and the cost of being wrong rises with every
milestone stacked on top of it.

---

## 5. Validation plan

For each hypothesis: how it is tested, what would support it, what would **refute** it,
and what decision changes if it is false. The last column is the point — a hypothesis
whose failure changes nothing was not worth testing.

### H7 — verified presence increases trust and action ⚠️ *validate first*

The foundational one. Test comprehension **before** preference — a badge nobody
understands cannot be trusted, and asking "do you trust this?" while pointing at it
teaches the answer.

- **Test, in order:**
  1. *Unprompted comprehension.* Show a feed with verified and unverified posts. Ask what
     they notice and what the badge means. Do not mention verification.
  2. *Behavioural choice.* Two posts about comparable places, one verified. Which would
     they act on, and why — in their words.
  3. *Once live:* compare save / "ask about this" / open-place rates on verified versus
     unverified posts of similar content and recency. **Observed, not validated** — the
     badge correlates with recency and with a user standing somewhere worth posting from,
     so it cannot be read as causal on its own.
- **Supports:** users spot the distinction unprompted, describe it in trust terms, and
  choose the verified post for a reason connected to its being real.
- **Refutes:** users do not notice it; cannot explain it; explain it wrongly ("sponsored",
  "popular"); or notice it and act identically.
- **If false:** the trust layer is decoration. That does not automatically mean removing
  it — server-side verification also protects the feed from being gamed, which has value
  regardless of whether readers perceive it. But it would mean **the earned-messaging
  gate and Passport credibility rest on something users do not see**, and both would need
  rejustifying on their own terms rather than borrowing authority from the badge. It
  would also make "make verification legible" a higher priority than anything in H1–H6.

### H1 — biggest drop is plan → leaving home
- **Test:** cohort of created trips; measure how many see any activity on or after
  `start_date`. Pair with interviews covering the hours before departure.
- **Supports:** a large share of trips with stops and participants show no activity from
  the day before onward.
- **Refutes:** trips are active up to departure and drop later — mid-outing or afterwards.
- **If false:** the priority transition is not Plan→Experience; re-rank before any spec.

### H2 — coordination leaves Purday when the outing starts
- **Test:** `trip_messages` volume in the 48h before `start_date` versus the outing day.
  Ask directly where the group actually talked.
- **Supports:** message volume collapses on the day while the outing demonstrably happened.
- **Refutes:** volume holds or rises, or groups report never using Purday chat at all —
  which is a different problem, not this one.
- **If false:** a live group surface solves nothing; look at the individual instead.

### H3 — plans break and are abandoned rather than adapted
- **Test:** `trip_items` edits after `start_date`. Interviews on the last outing that went
  wrong.
- **Supports:** near-zero same-day edits alongside reports of things going wrong.
- **Refutes:** users routinely adapt, or nothing goes wrong often enough to matter.
- **If false:** drop adaptive/replan concepts entirely.

### H4 — the loop is never closed and a prompt would be welcome
- **Test:** what exists after `end_date` (`posts`, `stories`, `reviews`) tied to a trip.
  Ask what they did in the day after, and how a prompt would have landed.
- **Supports:** almost nothing is created post-outing, and users describe wanting to.
- **Refutes:** users already capture elsewhere and describe a prompt as nagging.
- **If false:** reflection is not a product gap. Do not build a prompt; **note that this
  also depends on push delivery (§1.2), which is unproven.**

### H5 — the good artefacts live outside Purday
- **Test:** ask to see the last outing's artefacts. Count what is in Purday.
- **Supports:** camera roll and chat hold the material; Purday holds only what was posted.
- **Refutes:** what was posted is what they cared about.
- **If false:** a private memory layer has no reason to exist; strengthen public sharing.

### H6 — Blueprints need prompting at the right moment
- **Test:** current conversion of completed outings to public trips. Ask users who never
  made one whether they knew it was possible.
- **Supports:** near-zero conversion plus willingness once explained.
- **Refutes:** users know and deliberately decline — which is a motivation problem, not a
  timing one, and needs a different answer.
- **If false:** stop treating exposure as the fix for low Blueprint supply.

---

## 6. What our own data can answer

Real signals already in the database — cheaper and more honest than asking people to
recall behaviour. **Findings from these queries are Observed, not Validated**, and go in a
log below with the query, date and sample size.

| Question | Source |
|---|---|
| Do planned outings get built then abandoned? | `collaborative_trips` + `trip_items` vs activity after the date |
| Does group chat go quiet at the outing? | `trip_messages` timestamps against `start_date` |
| Does anyone post during an outing they planned here? | `posts.experience_type` joined to `trip_items` |
| What survives an outing? | `posts` / `stories` / `reviews` created after `end_date` |
| Where does attention actually go? | `content_views` dwell rollups |
| What gets saved and never used? | `saved_items` vs `trip_items` / `budget_items` |
| Do budget plans get completed? | `budget_plans` vs `budget_items` |
| Which discovery paths lead to a real plan? | `interactions` → trip creation |

**Standing caveat:** this describes existing users of an app that mostly stops after
planning. It can show where people drop off; it cannot show what they would have done with
a product that did not.

### Findings log *(empty)*

| Date | Question | Method / query | n | Finding | Category |
|---|---|---|---|---|---|
| | | | | | |

---

## 7. What needs humans

Data cannot answer intent.

- Contextual interviews with people who have run a real outing — walk the whole arc, not
  the app.
- At least one **observed** outing, end to end. Where does the phone come out, and why?
- Non-users who plan outings well without us: what do they use at each phase?
- Lapsed users: what were they doing when they stopped.

Ask what people **did last time**, never what they **would** like. Feature requests are not
research, and a user who likes an idea has not validated it.

---

## 8. Exit criteria

Research is done — and a product specification may begin — when:

- [ ] Every research question in §3 has an evidenced answer or an explicit "unknown".
- [ ] **H7 is resolved.** No specification proceeds while the product's load-bearing
      assumption is untested.
- [ ] H1–H6 are each supported, refuted, or marked untestable with current data.
- [ ] Momentum drops are **ranked by evidence**, not by how interesting they are.
- [ ] Assumptions in §2 that research touched have been moved, confirmed or struck.
- [ ] The top drop is stated as a user problem, with no solution attached.
- [ ] Every proposed direction names the pillar it strengthens (Bible §1.1).
- [ ] Anything that would raise time-in-app without raising real-world time is rejected on
      the record, with reasoning.

---

## 9. Not in scope

Solutions. This phase produces understanding. Feature names, screens and architecture
belong to the specification — after these criteria are met, and after Stage 5 has closed.
