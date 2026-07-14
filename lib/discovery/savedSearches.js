import AsyncStorage from '@react-native-async-storage/async-storage';

// Saved searches — a named term + its filters the user can re-run in one tap. Local
// (device-only, no account), mirroring recentSearches so the search UI stays a thin
// presentation layer. Dedup is by (term + filters) so re-saving the same search
// just moves it to the top.
const KEY = 'discovery.savedSearches';
const MAX = 20;

const sig = (term, filters) => JSON.stringify({ t: (term ?? '').trim().toLowerCase(), f: filters ?? {} });

export async function getSavedSearches() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSearch({ term, filters }) {
  const entry = { id: `${Date.now()}`, term: (term ?? '').trim(), filters: filters ?? {} };
  try {
    const cur = await getSavedSearches();
    const s = sig(entry.term, entry.filters);
    const next = [entry, ...cur.filter((x) => sig(x.term, x.filters) !== s)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return entry;
  } catch {
    return null;
  }
}

export async function removeSavedSearch(id) {
  try {
    const cur = await getSavedSearches();
    await AsyncStorage.setItem(KEY, JSON.stringify(cur.filter((x) => x.id !== id)));
  } catch {
    /* non-fatal */
  }
}
