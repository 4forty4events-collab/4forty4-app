# Stage 6 — Research brief

Lifecycle stage 1 of 12 (see Design Bible §19). Nothing here authorises code. Stage 6
implementation is gated on Stage 5 passing hardware validation.

---

## ⚠️ This document contains questions, not answers

**It holds no findings, and none may be added except from real evidence.**

Fabricated user research is the most dangerous thing this product could produce. A made-up
stat on a card misleads one user; a made-up insight about where people lose momentum
misdirects an entire milestone, and it does so invisibly — nobody can tell a confident
invented finding from a real one six months later. The Bible's rule (§3) applies here with
more force than anywhere in the UI.

Rules for filling this in:

- Every claim carries its source: a query against our own data, an interview, an observed
  session, or a cited external study.
- Hypotheses are written as falsifiable statements and clearly labelled untested. The
  ones below were derived from the product's structure, **not from users** — they are
  starting points to attack, not conclusions.
- "We don't know" is a valid and expected answer. Record it.
- Sample sizes and dates are stated. Three people is a signal, not a finding.

---

## 1. The question

Not *"what feature should we build next?"* but:

> **Where does the user's momentum naturally drop?**

Those moments are where Purday should become most helpful. A feature that fills a drop is
worth more than a feature that adds capability to a phase already working.

## 2. The journey under study

The complete arc of an outing, end to end:

```
Inspiration → Planning → Commitment → Anticipation → Travel → Arrival
→ Experience → Transition → Reflection → Memory → Re-discovery
```

For each phase, answer:

1. What is the user actually doing, and with what — Purday, another app, or nothing?
2. What does Purday do here today? (Be honest: for several phases the answer is nothing.)
3. Where does momentum drop — abandonment, friction, or simply the app becoming irrelevant?
4. What would "helpful" look like without demanding more screen time?
5. Which pillar (Bible §1.1) does this phase belong to, and is it served or neglected?

**Current coverage, stated plainly as the starting map — to be corrected by research, not
trusted:** Purday is strongest at Inspiration, Planning and Commitment (Discover, Plan,
Blueprints), newly present at Experience (Stage 5 live posts), and thinnest at
Anticipation, Travel, Arrival, Transition, Reflection, Memory and Re-discovery.

## 3. Priority transitions

### 3.1 Plan → Experience

*How does Purday become an active companion once someone leaves home, instead of
disappearing after the plan is made?*

Untested hypotheses to attack:

- **H1** — the app goes quiet exactly when the user commits, and the outing runs on
  screenshots, group chat and maps instead.
- **H2** — the plan becomes stale on contact with reality (a place is shut, the group is
  late, the weather turns) and there is no way to adapt it without rebuilding it.
- **H3** — an outing is a *group* activity, but the live moment is currently a *solo*
  interaction.

Questions: what does the user need at the door, in transit, and at each stop? What of
that is genuinely useful versus a reason to look at a phone during a night out — which
would violate §1? Does a companion mode help the person or interrupt them?

### 3.2 Experience → Remember

*How does the app help people preserve, relive and build on experiences after they end?*

Untested hypotheses to attack:

- **H4** — nothing closes the loop; an outing simply stops, and the app never asks how it
  went.
- **H5** — the artefacts of a great outing are scattered (camera roll, chat, receipts) and
  Purday holds only the part that was posted publicly.
- **H6** — reflection is where a Blueprint would naturally be born, and that moment is
  currently unused.

Questions: what makes an outing worth remembering, and how much of that is capturable
without extra work? What is the difference between a memory a person keeps and one they
publish? What would make someone return to an old outing months later — the
Re-discovery phase, presently absent?

## 4. What our own data can answer

Real signals already in the database. Cheaper and more honest than asking people to recall
their behaviour — but note this describes **existing users of an app that mostly stops
after planning**, so it can show where people drop off, not what they'd have done with a
product that didn't.

| Question | Source |
|---|---|
| Do planned outings get built and then abandoned? | `collaborative_trips` + `trip_items` vs anything after the date |
| Does group chat go quiet at the outing, or spike? | `trip_messages` timestamps against `start_date` |
| Does anyone post during an outing they planned here? | `posts.experience_type` joined to `trip_items` |
| What survives an outing? | `posts` / `stories` / `reviews` created after `end_date` |
| Where does attention actually go? | `content_views` dwell rollups |
| What gets saved and never used? | `saved_items` vs `trip_items` / `budget_items` |
| Do budget plans get completed? | `budget_plans` vs `budget_items` |
| Which discovery paths lead to a real plan? | `interactions` → trip creation |

Caveat to carry into every conclusion: the catalogue is not yet dense in every category,
so low engagement may reflect thin data rather than low interest.

## 5. What needs humans

Data cannot answer intent. Required:

- Contextual interviews with people who have run a real outing — walk the whole arc, not
  the app.
- At least one **observed** outing end to end. Where does the phone come out, and why?
- Non-users who plan outings well without us: what do they use at each phase?
- Lapsed users: what were they doing at the moment they stopped.

Ask what people *did last time*, never what they *would* like. Feature requests are not
research.

## 6. Exit criteria

Research is done — and a product specification may begin — when:

- [ ] Every phase in §2 has an evidenced answer, or an explicit "unknown".
- [ ] The momentum drops are **ranked by evidence**, not by how interesting they are.
- [ ] H1–H6 are each supported, refuted, or marked untestable with current data.
- [ ] The top drop is stated as a user problem, with no solution attached.
- [ ] Every proposed direction names the pillar it strengthens (§1.1).
- [ ] Anything that would raise time-in-app without raising real-world time is rejected,
      on the record, with the reasoning.

## 7. Not in scope

Solutions. This phase produces understanding. Feature names, screens and architecture come
in the specification, after these criteria are met — and Stage 5 has closed.
