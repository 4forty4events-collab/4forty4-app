import { supabase } from '../supabase';
import { CATEGORIES } from '../categories';

// Profile & Settings data-access layer. Framework-agnostic (no React): plain
// async functions returning normalized camelCase domain objects. The ONLY place
// that knows the profiles / user_settings table shapes, so the UI and any future
// service can consume a stable contract.

// ---- normalizers (snake_case row -> camelCase domain) ----------------------
export function normalizeProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email ?? null,
    phone: row.phone ?? null,
    fullName: row.full_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    city: row.city ?? null,
    market: row.market ?? null,
    isAdmin: !!row.is_admin,
    bio: row.bio ?? null,
    interests: row.interests ?? [],
    favoriteCategories: row.favorite_categories ?? [],
    languages: row.languages ?? [],
    createdAt: row.created_at ?? null,
  };
}

export function normalizeSettings(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    profileVisibility: row.profile_visibility,      // 'public' | 'private'
    shareActivity: !!row.share_activity,
    personalizedRecs: !!row.personalized_recs,
    notifyEventReminders: !!row.notify_event_reminders,
    notifyNearby: !!row.notify_nearby,
    notifyRecommendations: !!row.notify_recommendations,
    notifyOrganizerUpdates: !!row.notify_organizer_updates,
    appLanguage: row.app_language ?? 'en',
  };
}

// ---- profile ----------------------------------------------------------------
export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return normalizeProfile(data);
}

// Patch accepts any subset of { interests, favoriteCategories, languages, bio }.
// favoriteCategories is validated against the known category set here so junk
// never reaches the DB (arrays can't carry element checks cleanly).
export async function updateProfileMetadata(userId, patch = {}) {
  const row = {};
  if ('interests' in patch) row.interests = dedupeStrings(patch.interests);
  if ('favoriteCategories' in patch) {
    row.favorite_categories = dedupeStrings(patch.favoriteCategories).filter((c) => CATEGORIES.includes(c));
  }
  if ('languages' in patch) row.languages = dedupeStrings(patch.languages);
  if ('bio' in patch) row.bio = patch.bio?.trim() || null;

  const { data, error } = await supabase.from('profiles').update(row).eq('id', userId).select('*').single();
  if (error) throw error;
  return normalizeProfile(data);
}

// ---- settings ---------------------------------------------------------------
const SETTINGS_COLUMNS = {
  profileVisibility: 'profile_visibility',
  shareActivity: 'share_activity',
  personalizedRecs: 'personalized_recs',
  notifyEventReminders: 'notify_event_reminders',
  notifyNearby: 'notify_nearby',
  notifyRecommendations: 'notify_recommendations',
  notifyOrganizerUpdates: 'notify_organizer_updates',
  appLanguage: 'app_language',
};

export async function getSettings(userId) {
  const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return normalizeSettings(data);
  // Defensive lazy-create (the signup trigger + backfill should already cover it).
  const { data: created, error: insErr } = await supabase
    .from('user_settings').insert({ user_id: userId }).select('*').single();
  if (insErr) throw insErr;
  return normalizeSettings(created);
}

// Patch is a subset of the camelCase settings keys; only whitelisted keys are
// written (never trust arbitrary input into a settings row).
export async function updateSettings(userId, patch = {}) {
  const row = { updated_at: new Date().toISOString() };
  for (const [key, col] of Object.entries(SETTINGS_COLUMNS)) {
    if (key in patch) row[col] = patch[key];
  }
  const { data, error } = await supabase
    .from('user_settings').update(row).eq('user_id', userId).select('*').single();
  if (error) throw error;
  return normalizeSettings(data);
}

// ---- derived stats + account deletion --------------------------------------
export async function getTravelStats(market = null) {
  const { data, error } = await supabase.rpc('get_travel_stats', { p_market: market });
  if (error) throw error;
  const s = data ?? {};
  return {
    placesExplored: s.places_explored ?? 0,
    placesSaved: s.places_saved ?? 0,
    eventsSaved: s.events_saved ?? 0,
    plansCreated: s.plans_created ?? 0,
    categoriesExplored: s.categories_explored ?? 0,
    topCategory: s.top_category ?? null,
  };
}

// Irreversible: erases the caller's account + data. The UI must confirm hard and
// sign out afterward.
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}

function dedupeStrings(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).map((s) => String(s).trim()).filter(Boolean)));
}
