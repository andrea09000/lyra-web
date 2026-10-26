import AsyncStorage from '@react-native-async-storage/async-storage';
import { LibraryState, Playlist, TasteArtist, Track } from '@/types/music';

const KEYS = {
  favorites: '@lyra/favorites',
  recent: '@lyra/recent',
  playlists: '@lyra/playlists',
  onboarding: '@lyra/onboarding',
  tastes: '@lyra/tastes',
  profile: '@lyra/profile',
  homeFeed: '@lyra/home-feed',
  artistImages: '@lyra/artist-images-v2',
  libraryMetaRefresh: '@lyra/library-meta-refresh',
  tasteProfile: '@lyra/taste-profile-v1',
} as const;

export type HomeFeedCache = {
  tasteKey: string;
  forYou: Track[];
  trending: Track[];
  savedAt: number;
};

const HOME_FEED_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function loadHomeFeed(tasteKey: string): Promise<HomeFeedCache | null> {
  const raw = await AsyncStorage.getItem(KEYS.homeFeed);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as HomeFeedCache;
    if (data.tasteKey !== tasteKey) return null;
    if (Date.now() - data.savedAt > HOME_FEED_TTL_MS) return null;
    if (!data.forYou?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export async function saveHomeFeed(cache: HomeFeedCache) {
  await AsyncStorage.setItem(KEYS.homeFeed, JSON.stringify(cache));
}

export async function loadArtistImageCache(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(KEYS.artistImages);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveArtistImageCache(map: Record<string, string>) {
  await AsyncStorage.setItem(KEYS.artistImages, JSON.stringify(map));
}

/** Throttle for `videos.list` library metadata refresh (cheap, but still quota). */
const LIBRARY_META_TTL_MS = 24 * 60 * 60 * 1000;

export async function shouldRefreshLibraryMeta(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEYS.libraryMetaRefresh);
  if (!raw) return true;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > LIBRARY_META_TTL_MS;
}

export async function markLibraryMetaRefreshed() {
  await AsyncStorage.setItem(KEYS.libraryMetaRefresh, String(Date.now()));
}

export type UserProfile = {
  firstName: string;
  lastName: string;
  email: string;
  provider: 'none' | 'google';
};

const MAX_RECENT = 40;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadLibrary(): Promise<LibraryState> {
  const [favoritesRaw, recentRaw, playlistsRaw, onboardingRaw, tastesRaw] = await Promise.all([
    AsyncStorage.getItem(KEYS.favorites),
    AsyncStorage.getItem(KEYS.recent),
    AsyncStorage.getItem(KEYS.playlists),
    AsyncStorage.getItem(KEYS.onboarding),
    AsyncStorage.getItem(KEYS.tastes),
  ]);

  return {
    favorites: safeParse<Track[]>(favoritesRaw, []),
    recent: safeParse<Track[]>(recentRaw, []),
    playlists: safeParse<Playlist[]>(playlistsRaw, []),
    onboardingDone: onboardingRaw === '1',
    tastes: safeParse<TasteArtist[]>(tastesRaw, []),
  };
}

export async function saveFavorites(favorites: Track[]) {
  await AsyncStorage.setItem(KEYS.favorites, JSON.stringify(favorites));
}

export async function saveRecent(recent: Track[]) {
  await AsyncStorage.setItem(KEYS.recent, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export async function savePlaylists(playlists: Playlist[]) {
  await AsyncStorage.setItem(KEYS.playlists, JSON.stringify(playlists));
}

export async function saveTastes(tastes: TasteArtist[]) {
  await AsyncStorage.setItem(KEYS.tastes, JSON.stringify(tastes));
}

export async function setOnboardingDone() {
  await AsyncStorage.setItem(KEYS.onboarding, '1');
}

export async function clearLibraryData() {
  await AsyncStorage.multiRemove([
    KEYS.favorites,
    KEYS.recent,
    KEYS.playlists,
  ]);
}

export async function resetAppData() {
  await AsyncStorage.multiRemove([
    KEYS.favorites,
    KEYS.recent,
    KEYS.playlists,
    KEYS.onboarding,
    KEYS.tastes,
    KEYS.profile,
    KEYS.homeFeed,
    KEYS.artistImages,
    KEYS.tasteProfile,
    '@lyra/recent-searches',
  ]);
}

export async function loadProfile(): Promise<UserProfile> {
  const raw = await AsyncStorage.getItem(KEYS.profile);
  if (!raw) {
    return { firstName: '', lastName: '', email: '', provider: 'none' };
  }
  try {
    const data = JSON.parse(raw) as UserProfile;
    return {
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      email: data.email || '',
      provider: data.provider || 'none',
    };
  } catch {
    return { firstName: '', lastName: '', email: '', provider: 'none' };
  }
}

export async function saveProfile(profile: UserProfile) {
  await AsyncStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export function upsertRecent(list: Track[], track: Track): Track[] {
  return [track, ...list.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT);
}

export function toggleFavorite(list: Track[], track: Track): Track[] {
  const exists = list.some((t) => t.id === track.id);
  if (exists) return list.filter((t) => t.id !== track.id);
  return [track, ...list];
}
