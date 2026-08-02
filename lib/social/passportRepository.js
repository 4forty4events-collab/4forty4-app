import { supabase } from '../supabase';

// The Explorer Passport — how a person explores, rather than how many people follow
// them. Every number comes from the explorer_passport RPC, which derives it from real
// rows (posts, reviews, answers, public trips, trip rosters). Nothing here is
// self-declared, and nothing is invented client-side: if the RPC has no data to back a
// stat, the passport shows zero and the UI hides that line.

const EMPTY = {
  experiences: 0, verified: 0, reviews: 0, answers: 0, helpful: 0,
  blueprints: 0, clones: 0, outings: 0, credits: 0,
  cities: [], categories: [], streakWeeks: 0, since: null, level: 1,
  unlocks: { chat: false, groups: false, meetups: false },
};

export async function fetchExplorerPassport(userId) {
  if (!userId) return EMPTY;
  const { data, error } = await supabase.rpc('explorer_passport', { p_user: userId });
  if (error) throw error;
  if (!data) return EMPTY;
  return {
    experiences: data.experiences ?? 0,
    verified: data.verified ?? 0,
    reviews: data.reviews ?? 0,
    answers: data.answers ?? 0,
    helpful: data.helpful ?? 0,
    blueprints: data.blueprints ?? 0,
    clones: data.clones ?? 0,
    outings: data.outings ?? 0,
    credits: data.credits ?? 0,
    cities: Array.isArray(data.cities) ? data.cities.filter(Boolean) : [],
    categories: Array.isArray(data.categories) ? data.categories.filter(Boolean) : [],
    streakWeeks: data.streak_weeks ?? 0,
    since: data.since ?? null,
    level: data.level ?? 1,
    unlocks: {
      chat: !!data.unlocks?.chat,
      groups: !!data.unlocks?.groups,
      meetups: !!data.unlocks?.meetups,
    },
  };
}

export { EMPTY as EMPTY_PASSPORT };
