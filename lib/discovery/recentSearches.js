import AsyncStorage from '@react-native-async-storage/async-storage';

// Recent searches — a small local list (device-only, no account needed). Kept in
// the discovery module so the search UI stays a thin presentation layer.
const KEY = 'discovery.recentSearches';
const MAX = 8;

export async function getRecentSearches() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(term) {
  const t = (term ?? '').trim();
  if (t.length < 2) return;
  try {
    const cur = await getRecentSearches();
    const next = [t, ...cur.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* non-fatal: recents are a convenience, never block search on them */
  }
}

export async function clearRecentSearches() {
  try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ }
}
