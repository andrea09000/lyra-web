import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@lyra/recent-searches';
const MAX = 8;

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, MAX);
  } catch {
    return [];
  }
}

export async function pushRecentSearch(query: string): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return loadRecentSearches();
  // ytify: skip multi-token bulk pastes
  if (/[,\n]/.test(q)) return loadRecentSearches();
  const prev = await loadRecentSearches();
  const next = [query.trim(), ...prev.filter((s) => s.toLowerCase() !== q)].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function removeRecentSearch(query: string): Promise<string[]> {
  const q = query.trim().toLowerCase();
  const prev = await loadRecentSearches();
  const next = prev.filter((s) => s.toLowerCase() !== q);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
