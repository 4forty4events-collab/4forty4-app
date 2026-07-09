import { supabase } from './supabase';

// Core principle: a plan is Single-Day OR Trip, and that gates which listings
// are eligible. duration_days = 1 is day-plannable; > 1 is a trip.
export function planTypeForDuration(durationDays) {
  return (durationDays ?? 1) > 1 ? 'trip' : 'single_day';
}

export function isEligible(listing, planType) {
  const d = listing?.durationDays ?? 1;
  return planType === 'trip' ? d > 1 : d === 1;
}

export function defaultCurrency(market) {
  return market === 'ZW' ? 'USD' : 'DZD';
}

// --- Meal composition ------------------------------------------------------
// A restaurant's price_per_person is the cheapest menu line (price_min from
// menu-OCR) — a 30 DZD coffee, not a meal. So we compose a plausible per-person
// meal from the menu using its SECTION labels: mains from Nos Plats / Pâtes /
// Gratins, a drink from Boissons, a dessert from Nos Desserts (or a starter).
// Supplements/toppings (Suppléments Pizza — "Double fromage") are excluded — they
// are not standalone dishes. The main is anchored on the SUBSTANTIAL mains (never
// the cheap floor) and RANDOMIZED, so each rebuild differs. Because it's random,
// the chosen items are persisted (budget_items.breakdown) — the plan always shows
// exactly what was picked and frozen, and est_cost is that meal's total.
const MEAL_CATEGORIES = ['restaurant', 'cafe', 'nightlife'];

function parsePrice(p) {
  if (typeof p === 'number') return p > 0 ? p : null;
  const n = Number(String(p ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// Classify a menu section into a meal role. Accent-insensitive; matches the
// French section names menu-OCR produces. Supplements/toppings are excluded
// outright (a pizza "Double fromage" supplement is not a dish).
function roleForSection(section) {
  const s = (section ?? '').toLowerCase();
  if (/suppl|topping|garniture|accompagn|\bsauce\b|\bextra/.test(s)) return 'exclude';
  if (/boisson|drink|\bjus\b|caf[eé]|th[eé]|beverage|soda/.test(s)) return 'drink';
  if (/dessert|glace|p[âa]tisser|ice ?cream|viennoiser/.test(s)) return 'dessert';
  if (/entr[eé]e|starter|salad|soupe|appetiz/.test(s)) return 'starter';
  if (/plat|p[âa]tes|gratin|pizza|burger|grill|sandwich|tacos|panini|\bviande\b|main/.test(s)) return 'main';
  return 'other';
}

// Compose a plausible one-person meal — a real main + a drink + a dessert/starter
// — returning { total, items:[{name, price}] } or null. rng makes it vary per
// rebuild. The main is chosen at random among the SUBSTANTIAL mains (>= median of
// the mains section), so it's never the cheap floor and never a topping.
export function composeMeal(menu, rng = Math.random) {
  const items = (Array.isArray(menu) ? menu : [])
    .map((m) => ({ name: m?.name ?? null, price: parsePrice(m?.price), role: roleForSection(m?.section) }))
    .filter((x) => x.price != null && x.role !== 'exclude');
  if (items.length === 0) return null;

  const inRole = (r) => items.filter((x) => x.role === r).sort((a, b) => a.price - b.price);
  let mains = inRole('main');
  const drinks = inRole('drink');
  const desserts = inRole('dessert');
  const starters = inRole('starter');

  // No labeled mains (a menu with weak sections)? Treat the upper price half of
  // everything as the mains pool.
  if (mains.length === 0) {
    const sorted = [...items].sort((a, b) => a.price - b.price);
    mains = sorted.slice(Math.floor(sorted.length / 2));
  }
  if (mains.length === 0) return null;

  // Anchor a REAL main: random among mains priced at/above the mains' median, so
  // the long cheap tail of a big menu can never become the "main".
  const medianPrice = mains[Math.floor(mains.length / 2)].price;
  const bigMains = mains.filter((m) => m.price >= medianPrice);
  const chosen = [pickRandom(bigMains.length ? bigMains : mains, rng)];

  if (drinks.length) chosen.push(pickRandom(drinks, rng));
  // A third course most of the time: a dessert, else a starter.
  const third = desserts.length ? desserts : starters;
  if (third.length && rng() < 0.8) chosen.push(pickRandom(third, rng));

  const total = chosen.reduce((s, it) => s + it.price, 0);
  return { total, items: chosen.map((it) => ({ name: it.name, price: it.price })) };
}

// A labeled price estimate for a plan item with no composed meal (no menu, or a
// manual add): min/max from the normalized planner price.
export function priceEstimateFor(listing) {
  const min = listing?.pricePerPerson ?? null;
  const max = (listing?.priceMax != null && listing.priceMax !== min) ? listing.priceMax : null;
  return { min, max, estimated: !!listing?.priceEstimated, hasMenu: Array.isArray(listing?.menu) && listing.menu.length > 0 };
}

export async function createPlan(userId, { name, totalBudget, currency, market, planType }) {
  const { data, error } = await supabase
    .from('budget_plans')
    .insert({
      user_id: userId,
      name: name || null,
      total_budget: totalBudget,
      currency,
      market,
      plan_type: planType,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchPlan(planId) {
  const { data, error } = await supabase.from('budget_plans').select('*').eq('id', planId).single();
  if (error) throw error;
  return data;
}

// Plans with item count + spent total, newest first. Two queries (no per-plan
// N+1): one for plans, one for all their items aggregated client-side.
export async function fetchPlans(userId) {
  const { data: plans, error } = await supabase
    .from('budget_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!plans?.length) return [];

  const ids = plans.map((p) => p.id);
  const { data: items, error: e2 } = await supabase
    .from('budget_items')
    .select('plan_id, est_cost')
    .in('plan_id', ids);
  if (e2) throw e2;

  const agg = new Map();
  for (const it of items ?? []) {
    const a = agg.get(it.plan_id) ?? { count: 0, spent: 0 };
    a.count += 1;
    a.spent += Number(it.est_cost ?? 0);
    agg.set(it.plan_id, a);
  }
  return plans.map((p) => ({
    ...p,
    itemCount: agg.get(p.id)?.count ?? 0,
    spent: agg.get(p.id)?.spent ?? 0,
  }));
}

// Resolve a plan's items into { itemId, estCost, source, listing }.
export async function fetchPlanItems(planId, normalizeVenue, normalizeEvent) {
  const { data: rows, error } = await supabase
    .from('budget_items')
    .select('id, venue_id, event_id, est_cost, source, created_at, breakdown')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!rows?.length) return [];

  const venueIds = rows.filter((r) => r.venue_id).map((r) => r.venue_id);
  const eventIds = rows.filter((r) => r.event_id).map((r) => r.event_id);
  const [vres, eres] = await Promise.all([
    venueIds.length ? supabase.from('venues').select('*').in('id', venueIds) : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from('events').select('*, venues(name)').in('id', eventIds) : Promise.resolve({ data: [] }),
  ]);
  if (vres.error) throw vres.error;
  if (eres.error) throw eres.error;

  const byKey = new Map();
  (vres.data ?? []).forEach((v) => byKey.set(`venue-${v.id}`, normalizeVenue(v)));
  (eres.data ?? []).forEach((e) => byKey.set(`event-${e.id}`, normalizeEvent(e)));

  return rows
    .map((r) => ({
      itemId: r.id,
      estCost: Number(r.est_cost ?? 0),
      source: r.source,
      breakdown: Array.isArray(r.breakdown) ? r.breakdown : null,
      listing: byKey.get(r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`) ?? null,
    }))
    .filter((x) => x.listing);
}

// est_cost is a FROZEN snapshot at add-time — the plan total must not move if the
// listing's price/menu is later edited. A MANUAL add uses the per-person price
// the user saw on the card; AUTO-build passes an explicit estCost (the composed
// meal figure its math used), so the two flows stay honest to what's displayed.
export async function addPlanItem(planId, listing, source = 'manual', estCost = null, breakdown = null) {
  const { error } = await supabase.from('budget_items').insert({
    plan_id: planId,
    venue_id: listing.kind === 'venue' ? listing.id : null,
    event_id: listing.kind === 'event' ? listing.id : null,
    est_cost: estCost != null ? estCost : (listing.pricePerPerson ?? 0),
    breakdown: breakdown ?? null,
    source,
  });
  // 23505 = already in this plan (partial-unique). Treat as a no-op success.
  if (error && error.code !== '23505') throw error;
  return error?.code === '23505' ? 'duplicate' : 'added';
}

export async function removePlanItem(itemId) {
  const { error } = await supabase.from('budget_items').delete().eq('id', itemId);
  if (error) throw error;
}

// Fetch eligible candidates for auto-build: in-market, matching the plan's
// duration rule, with a known per-person cost the math can use. Single-Day pulls
// duration_days = 1 only; Trip pulls > 1 only — they never mix. Stub venues and
// past events are excluded. Returns normalized listings.
async function fetchCandidates(plan, options, normalizeVenue, normalizeEvent) {
  const { plan_type: planType, market } = plan;
  const categories = options?.categories ?? null;
  const nowIso = new Date().toISOString();

  let vq = supabase
    .from('venues')
    .select('*')
    .eq('market', market)
    .eq('is_stub', false)
    .not('price_per_person', 'is', null);
  let eq_ = supabase
    .from('events')
    .select('*, venues(name)')
    .eq('market', market)
    .gte('start_time', nowIso)
    .not('price_per_person', 'is', null);

  if (planType === 'trip') {
    vq = vq.gt('duration_days', 1);
    eq_ = eq_.gt('duration_days', 1);
  } else {
    vq = vq.eq('duration_days', 1);
    eq_ = eq_.eq('duration_days', 1);
  }
  if (categories?.length) {
    vq = vq.in('category', categories);
    eq_ = eq_.in('category', categories);
  }

  const [vres, eres] = await Promise.all([vq, eq_]);
  if (vres.error) throw vres.error;
  if (eres.error) throw eres.error;

  return [
    ...(vres.data ?? []).map(normalizeVenue),
    ...(eres.data ?? []).map(normalizeEvent),
  ]
    .filter((l) => l.pricePerPerson != null && l.pricePerPerson >= 0)
    // Compose the meal ONCE here (one random draw per candidate per build) and
    // reuse it for both the budget math and the persisted breakdown, so they
    // never disagree. plannerCost = the composed meal total for a food venue with
    // a menu, else the per-person price.
    .map((l) => {
      const meal = MEAL_CATEGORIES.includes(l.category) ? composeMeal(l.menu) : null;
      return { ...l, meal, plannerCost: meal?.total ?? (l.pricePerPerson ?? 0) };
    });
}

// A real day out has a SHAPE — you eat, you do something, you relax — not three
// restaurants. So auto-build varies by day-TYPE, not just by raw category: the
// 16 categories collapse into a handful of outing types, and selection
// round-robins across those in day order. (Category variety is still enforced on
// top, so "do" never becomes two museums.)
const DAY_TYPE = {
  restaurant: 'eat',
  cafe: 'cafe',
  nightlife: 'do', music_event: 'do', festival: 'do', sports: 'do',
  outdoor: 'do', tourism: 'do', culture: 'do', entertainment: 'do',
  wellness: 'relax',
  shopping: 'extra', hotel: 'extra', education: 'extra', meetup: 'extra', other: 'extra',
};
const DAY_ORDER = ['eat', 'do', 'cafe', 'relax', 'extra'];
function dayType(category) {
  return DAY_TYPE[category] ?? 'extra';
}

// Compose a varied day out within the budget. Buckets candidates by day-type,
// then round-robins eat -> do -> cafe -> relax -> extra, each pass taking the
// priciest still-affordable item whose CATEGORY hasn't been used up — so the
// result spans types AND categories, and biases toward actually using the
// budget rather than the cheapest single item. Single-Day = one per category;
// Trip allows two and one more item. typeCount lets the caller tell a real
// multi-type day from a thin one-type partial.
function selectCombination(candidates, budget, planType) {
  const maxItems = planType === 'trip' ? 5 : 4;
  const maxPerCat = planType === 'trip' ? 2 : 1;

  const byType = new Map();
  for (const c of candidates) {
    const t = dayType(c.category);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(c);
  }
  // Priciest first within each type — bias toward using the budget. plannerCost
  // is the composed meal for food venues (not the 30 DZD cheapest line).
  for (const group of byType.values()) {
    group.sort((a, b) => b.plannerCost - a.plannerCost);
  }

  const typeKeys = DAY_ORDER.filter((t) => byType.has(t));
  const catCounts = {};
  const pickedIds = new Set();
  const picked = [];
  let spent = 0;
  let progressed = true;

  while (picked.length < maxItems && progressed) {
    progressed = false;
    for (const t of typeKeys) {
      if (picked.length >= maxItems) break;
      const group = byType.get(t);
      const cand = group.find((c) => {
        const cat = c.category ?? 'other';
        return !pickedIds.has(`${c.kind}-${c.id}`)
          && (catCounts[cat] ?? 0) < maxPerCat
          && spent + c.plannerCost <= budget;
      });
      if (cand) {
        const cat = cand.category ?? 'other';
        picked.push(cand);
        pickedIds.add(`${cand.kind}-${cand.id}`);
        catCounts[cat] = (catCounts[cat] ?? 0) + 1;
        spent += cand.plannerCost;
        progressed = true;
      }
    }
  }

  const typeCount = new Set(picked.map((p) => dayType(p.category))).size;
  return { picked, spent, typeCount };
}

// Auto-build: clear prior auto items (manual items are preserved), then fill the
// REMAINING budget with a sensible, varied set. Re-runnable. Returns a summary
// with a friendly message — never an error on thin data.
export async function autoBuildPlan(plan, options, normalizeVenue, normalizeEvent) {
  // 1. Clear previous auto picks so a re-run is idempotent; keep manual items.
  const { error: delErr } = await supabase
    .from('budget_items')
    .delete()
    .eq('plan_id', plan.id)
    .eq('source', 'auto');
  if (delErr) throw delErr;

  // 2. Budget left after manual items (auto fills around them, never over total).
  const { data: remainingItems, error: itemsErr } = await supabase
    .from('budget_items')
    .select('venue_id, event_id, est_cost')
    .eq('plan_id', plan.id);
  if (itemsErr) throw itemsErr;

  const manualSpent = (remainingItems ?? []).reduce((s, r) => s + Number(r.est_cost ?? 0), 0);
  const remaining = plan.total_budget - manualSpent;
  if (remaining <= 0) {
    return { added: 0, candidates: 0, spent: 0, message: 'Your manual items already use the whole budget.' };
  }

  // 3. Candidates, minus anything already in the plan.
  const inPlan = new Set(
    (remainingItems ?? []).map((r) => (r.venue_id ? `venue-${r.venue_id}` : `event-${r.event_id}`)),
  );
  const all = await fetchCandidates(plan, options, normalizeVenue, normalizeEvent);
  const candidates = all
    .filter((l) => !inPlan.has(`${l.kind}-${l.id}`))
    .filter((l) => l.plannerCost <= remaining);

  if (candidates.length === 0) {
    return {
      added: 0,
      candidates: 0,
      spent: 0,
      message: 'No options fit this budget yet — the catalog is still filling up. Try a higher budget or check back soon.',
    };
  }

  // 4. Compose a varied day and persist as auto items (frozen est_cost).
  const { picked, spent, typeCount } = selectCombination(candidates, remaining, plan.plan_type);
  for (const listing of picked) {
    // Freeze the exact figure selection used, plus the composed meal items so the
    // plan can show what was picked (and it stays fixed even if the menu changes).
    await addPlanItem(plan.id, listing, 'auto', listing.plannerCost, listing.meal?.items ?? null);
  }

  // A real day spans 2+ outing types (eat + do + relax). When the priced catalog
  // is too thin for that, we still add the best partial set, but say so honestly
  // rather than passing off a single restaurant as a finished plan.
  const stops = picked.length;
  const isFullDay = stops >= 2 && typeCount >= 2;
  let message;
  if (stops === 0) {
    message = `Found ${candidates.length} option${candidates.length === 1 ? '' : 's'}, but none fit your budget. Try raising it.`;
  } else if (isFullDay) {
    message = `Built a ${stops}-stop day across ${typeCount} types for ${spent} ${plan.currency}. Edit or re-run to taste.`;
  } else {
    message = `Added what fits your budget for now (${stops} stop${stops === 1 ? '' : 's'}, ${spent} ${plan.currency}). More variety — cafes, activities, things to do — will fill in here as the catalog grows.`;
  }
  return { added: stops, candidates: candidates.length, spent, typeCount, message };
}
