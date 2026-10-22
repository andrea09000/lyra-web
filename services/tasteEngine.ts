import AsyncStorage from '@react-native-async-storage/async-storage';
import { TasteArtist, Track } from '@/types/music';
import { getRelated, searchTracks } from '@/services/youtube';

const KEY = '@lyra/taste-profile-v1';

export type TasteProfile = {
  /** Artist name (lower) → affinity score */
  artists: Record<string, number>;
  /** Track id → affinity (skips / completes) */
  tracks: Record<string, number>;
  updatedAt: number;
};

const emptyProfile = (): TasteProfile => ({
  artists: {},
  tracks: {},
  updatedAt: Date.now(),
});

let memory: TasteProfile | null = null;
let loadPromise: Promise<TasteProfile> | null = null;

function normArtist(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bump(
  map: Record<string, number>,
  key: string,
  delta: number,
  min = -40,
  max = 80
) {
  if (!key) return;
  map[key] = clamp((map[key] || 0) + delta, min, max);
}

/** Drop in-memory + persisted taste profile (e.g. after reset app). */
export async function clearTasteProfile() {
  memory = null;
  loadPromise = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export async function loadTasteProfile(): Promise<TasteProfile> {
  if (memory) return memory;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) {
        memory = emptyProfile();
        return memory;
      }
      const data = JSON.parse(raw) as TasteProfile;
      memory = {
        artists: data.artists && typeof data.artists === 'object' ? data.artists : {},
        tracks: data.tracks && typeof data.tracks === 'object' ? data.tracks : {},
        updatedAt: Number(data.updatedAt) || Date.now(),
      };
      return memory;
    } catch {
      memory = emptyProfile();
      return memory;
    }
  })();
  return loadPromise;
}

async function persist(profile: TasteProfile) {
  memory = profile;
  profile.updatedAt = Date.now();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // ignore quota
  }
}

/** Seed from onboarding / gusti artisti. */
export async function seedTastesFromArtists(artists: TasteArtist[]) {
  const profile = await loadTasteProfile();
  for (const a of artists) {
    const key = normArtist(a.name);
    if (!key) continue;
    if ((profile.artists[key] || 0) < 12) bump(profile.artists, key, 18);
  }
  await persist(profile);
}

/**
 * Learn from a finished / left listen.
 * - Early skip → dislike
 * - Solid listen → like
 * - Near-complete → strong like
 */
export async function recordListen(input: {
  track: Track;
  listenedSeconds: number;
  durationSeconds: number;
  skipped: boolean;
}) {
  const { track, listenedSeconds, durationSeconds, skipped } = input;
  const profile = await loadTasteProfile();
  const artist = normArtist(track.artist);
  const dur = durationSeconds > 0 ? durationSeconds : 0;
  const ratio = dur > 0 ? listenedSeconds / dur : 0;

  if (skipped && listenedSeconds < 12 && (dur === 0 || dur > 25)) {
    bump(profile.tracks, track.id, -8);
    bump(profile.artists, artist, -3);
  } else if (ratio >= 0.75 || listenedSeconds >= 90) {
    bump(profile.tracks, track.id, 10);
    bump(profile.artists, artist, 6);
  } else if (ratio >= 0.4 || listenedSeconds >= 35) {
    bump(profile.tracks, track.id, 5);
    bump(profile.artists, artist, 3);
  } else if (listenedSeconds >= 15) {
    bump(profile.tracks, track.id, 2);
    bump(profile.artists, artist, 1);
  }

  await persist(profile);
}

export async function recordFavorite(track: Track, liked: boolean) {
  const profile = await loadTasteProfile();
  const artist = normArtist(track.artist);
  bump(profile.tracks, track.id, liked ? 16 : -10);
  bump(profile.artists, artist, liked ? 10 : -4);
  await persist(profile);
}

export function scoreTrack(track: Track, profile: TasteProfile, boostIds?: Set<string>): number {
  const artist = normArtist(track.artist);
  let score = (profile.artists[artist] || 0) * 1.4 + (profile.tracks[track.id] || 0);
  if (boostIds?.has(track.id)) score += 8;
  // Slight novelty: unknown artists aren't punished hard
  if (!(artist in profile.artists)) score += 0.5;
  // Soft popularity hint
  if (track.viewCount) score += Math.min(4, Math.log10(track.viewCount + 1));
  return score;
}

function dedupeTracks(list: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of list) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

function topArtists(profile: TasteProfile, limit: number): string[] {
  return Object.entries(profile.artists)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function trackMatchesArtist(track: Track, artistName: string): boolean {
  const a = normArtist(track.artist);
  const p = normArtist(artistName);
  if (!a || !p) return false;
  if (a === p || a.includes(p) || p.includes(a)) return true;
  const tokens = p.split(' ').filter((t) => t.length > 2);
  return tokens.some((t) => a.includes(t));
}

/** Preferred artists: gusti + listening affinity, display names for queries. */
export async function preferredArtistsForSearch(
  tastes?: TasteArtist[]
): Promise<{ name: string; score: number }[]> {
  const profile = await loadTasteProfile();
  const map = new Map<string, { name: string; score: number }>();

  for (const t of tastes || []) {
    const key = normArtist(t.name);
    if (!key) continue;
    const score = Math.max(profile.artists[key] || 0, 18);
    map.set(key, { name: t.name, score });
  }

  for (const [key, score] of Object.entries(profile.artists)) {
    if (score <= 2) continue;
    const existing = map.get(key);
    if (!existing) {
      // Prefer a nicer casing from key if no taste entry
      map.set(key, {
        name: key.replace(/\b\w/g, (c) => c.toUpperCase()),
        score,
      });
    } else if (score > existing.score) {
      map.set(key, { name: existing.name, score });
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

/**
 * Search biased by taste: e.g. prefers Sfera + query "lontano"
 * → Sfera tracks first, then the rest.
 */
export async function searchTracksForYou(
  query: string,
  limit = 30,
  tastes?: TasteArtist[]
): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  const preferred = await preferredArtistsForSearch(tastes);
  const qNorm = normArtist(q);

  // Skip artist-boost queries if the user already typed that artist
  const boostArtists = preferred.slice(0, 3).filter((a) => {
    const p = normArtist(a.name);
    const first = p.split(' ')[0] || p;
    return first.length > 2 && !qNorm.includes(first);
  });

  // One network search only — extra artist queries used to stall / fail on cold API.
  // Re-rank locally with tastes; optional single boost if general is thin.
  const general = await searchTracks(q, limit).catch(() => [] as Track[]);
  let boosted: Track[] = [];
  if (general.length < Math.min(8, limit) && boostArtists[0]) {
    boosted = await searchTracks(`${boostArtists[0].name} ${q}`, 12).catch(() => [] as Track[]);
  }

  const all = dedupeTracks([...boosted, ...general]);
  if (!preferred.length) return all.slice(0, limit);

  const preferredHits: { track: Track; score: number }[] = [];
  const rest: Track[] = [];

  for (const track of all) {
    let best = 0;
    for (const p of preferred) {
      if (!trackMatchesArtist(track, p.name)) continue;
      best = Math.max(best, p.score);
    }
    if (best > 0) preferredHits.push({ track, score: best });
    else rest.push(track);
  }

  preferredHits.sort((a, b) => b.score - a.score);

  return dedupeTracks([
    ...preferredHits.map((x) => x.track),
    ...rest,
  ]).slice(0, limit);
}

/**
 * Build a personalized radio tail after `seed`.
 * Mix: YouTube related + searches for liked artists + favorites/recent boosts.
 */
export async function buildRadioQueue(input: {
  seed: Track;
  excludeIds: Set<string>;
  favorites?: Track[];
  recent?: Track[];
  tastes?: TasteArtist[];
  limit?: number;
}): Promise<Track[]> {
  const limit = input.limit ?? 24;
  const profile = await loadTasteProfile();

  // Soft-seed onboarding tastes if profile is empty
  if (
    input.tastes?.length &&
    Object.keys(profile.artists).length < 3
  ) {
    await seedTastesFromArtists(input.tastes);
  }

  const boost = new Set<string>([
    ...(input.favorites || []).map((t) => t.id),
    ...(input.recent || []).slice(0, 12).map((t) => t.id),
  ]);

  const artistQueries = [
    ...topArtists(profile, 4),
    ...(input.tastes || []).slice(0, 3).map((t) => t.name),
    input.seed.artist,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const uniqueQueries = [...new Set(artistQueries.map(normArtist))]
    .slice(0, 5)
    .map((q) => artistQueries.find((a) => normArtist(a) === q) || q);

  const [related, ...searches] = await Promise.all([
    getRelated(input.seed.id, 20).catch(() => [] as Track[]),
    ...uniqueQueries.slice(0, 3).map((q) =>
      searchTracks(`${q} mix`, 8).catch(() => [] as Track[])
    ),
  ]);

  const pool = dedupeTracks([
    ...related,
    ...searches.flat(),
    ...(input.favorites || []).slice(0, 20),
    ...(input.recent || []).slice(0, 15),
  ]).filter((t) => !input.excludeIds.has(t.id) && t.id !== input.seed.id);

  // Drop hard-disliked
  const viable = pool.filter((t) => (profile.tracks[t.id] || 0) > -12);

  viable.sort((a, b) => scoreTrack(b, profile, boost) - scoreTrack(a, profile, boost));

  // Light shuffle among top tier so it doesn't feel static
  const top = viable.slice(0, Math.min(viable.length, limit + 8));
  for (let i = top.length - 1; i > 0; i -= 1) {
    if (Math.random() > 0.35) continue;
    const j = Math.floor(Math.random() * (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }

  return top.slice(0, limit);
}
