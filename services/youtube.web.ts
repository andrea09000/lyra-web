/**
 * Web YouTube layer — no Data API quota.
 * Search/meta via scrape API + Invidious.
 * Audio URLs via on-device scrape (ytScrape.web) — never Vercel googlevideo.
 */
import { TasteArtist, Track } from '@/types/music';
import { loadArtistImageCache, saveArtistImageCache } from '@/services/storage';
import { getCachedSearch, setCachedSearch } from '@/services/searchCache';
import {
  forgetScrape,
  peekScrapeUrl,
  rememberScrapeHit,
  scrapeAudioCandidates,
  warmScrape,
} from '@/services/ytScrape.web';
import { prefetchPlayResolve as warmPlayResolve } from '@/services/playResolve.web';
import { prefetchArtistCovers, prefetchTrackCovers } from '@/services/coverCache';

export function prefetchPlayResolve(videoId: string): void {
  warmPlayResolve(videoId);
}

function getScrapeUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SCRAPE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    // Production (Vercel / HTTPS): same origin `/api/*`
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return window.location.origin;
    }
    // Local dev: dedicated scrape process on :8791
    return `http://${host}:8791`;
  }
  return 'http://localhost:8791';
}

const SEED_INSTANCES = [
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://yewtu.be',
];

const streamGen = new Map<string, number>();
let scrapeHealthy: boolean | null = null;
let warmerEl: HTMLAudioElement | null = null;

type InvidiousVideo = {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  videoThumbnails?: { quality: string; url: string }[];
  lengthSeconds?: number;
  viewCount?: number;
};

export function hasYoutubeApiKey(): boolean {
  // Web uses scrape — no official key required
  return true;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/official\s*audio/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ytThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

function musicSearchQuery(query: string): string {
  const q = query.trim();
  if (/\b(music|song|audio|official|mix|lyrics|track|musica|canzone)\b/i.test(q)) return q;
  return `${q} music`;
}

const NON_MUSIC_RE =
  /\b(tutorial|how\s*to|lesson|lezione|corso|reaction|review|recensione|podcast|trailer|gameplay|unboxing|explained|documentary|documentario|vlog|makeup|recipe|ricetta|news|notizie|interview|intervista|behind the scenes|making of|speedrun|walkthrough|asmr(?!\s*music))\b/i;

function looksLikeMusic(track: Track): boolean {
  const title = track.title || '';
  if (NON_MUSIC_RE.test(title)) return false;
  // Soft filter only — don't wipe results when duration is missing (common on Piped/InnerTube)
  if (track.duration > 0) {
    if (track.duration < 25) return false;
    const longOk = /\b(mix|playlist|album|full album|dj set|live|concert|concerto|set|compilation|hour)\b/i.test(
      title
    );
    if (track.duration > 30 * 60 && !longOk) return false;
  }
  return true;
}

async function fetchJson(url: string, timeoutMs = 3500): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeGet<T>(path: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const data = (await fetchJson(`${getScrapeUrl()}${path}`, timeoutMs)) as T;
    scrapeHealthy = true;
    return data;
  } catch {
    scrapeHealthy = false;
    return null;
  }
}

function mapVideo(video: InvidiousVideo): Track | null {
  if (!video.videoId || !video.title) return null;
  if (video.type && video.type !== 'video') return null;
  return {
    id: video.videoId,
    title: cleanTitle(video.title),
    artist: video.author || 'YouTube',
    thumbnail: video.videoId ? ytThumb(video.videoId) : '',
    duration: video.lengthSeconds ?? 0,
    viewCount: video.viewCount,
  };
}

async function withInstances<T>(runner: (base: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  const first = SEED_INSTANCES.slice(0, 3).map((base) => runner(base.replace(/\/$/, '')));
  try {
    return await raceFirst(first);
  } catch (error) {
    lastError = error;
  }
  for (const base of SEED_INSTANCES.slice(3)) {
    try {
      return await runner(base.replace(/\/$/, ''));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Nessuna istanza disponibile');
}

async function raceFirst<T>(tasks: Promise<T>[]): Promise<T> {
  if (tasks.length === 0) throw new Error('Nessuna fonte');
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let pending = tasks.length;
    let lastError: unknown;
    for (const task of tasks) {
      task
        .then((value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        })
        .catch((err) => {
          lastError = err;
          pending -= 1;
          if (!settled && pending === 0) {
            settled = true;
            reject(lastError ?? new Error('Tutte le fonti fallite'));
          }
        });
    }
  });
}

async function searchInvidious(query: string, limit: number): Promise<Track[]> {
  const data = await withInstances((base) =>
    fetchJson(
      `${base}/api/v1/search?q=${encodeURIComponent(musicSearchQuery(query))}&type=video&sort_by=relevance`
    )
  );
  const list = Array.isArray(data) ? (data as InvidiousVideo[]) : [];
  return list
    .map(mapVideo)
    .filter((t): t is Track => Boolean(t))
    .filter(looksLikeMusic)
    .slice(0, limit);
}

export async function searchTracks(query: string, limit = 24): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const cached = await getCachedSearch(q);
    if (cached && cached.length >= limit) return cached.slice(0, limit);
  } catch {
    // miss
  }

  let tracks: Track[] = [];

  const scraped = await scrapeGet<{ tracks?: Track[] }>(
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
  if (scraped?.tracks?.length) {
    const filtered = scraped.tracks.filter(looksLikeMusic);
    // If the filter nuked everything, keep raw API hits anyway
    tracks = filtered.length ? filtered : scraped.tracks;
  }

  if (!tracks.length) {
    try {
      tracks = await searchInvidious(q, limit);
    } catch {
      // mirrors often 403/502 — API already tried InnerTube/Piped
    }
  }

  if (tracks.length > 0) void setCachedSearch(q, tracks);
  return tracks.slice(0, limit);
}

const ARTIST_COLORS = ['#2D6A4F', '#1B4332', '#081C15', '#40916C', '#52B788', '#145C38', '#0B1A12'];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % ARTIST_COLORS.length;
  return ARTIST_COLORS[h];
}

function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*-\s*topic\s*$/i, '')
    .replace(/\s*(vevo|official)\s*$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchArtists(query: string, limit = 1): Promise<TasteArtist[]> {
  const q = query.trim();
  if (!q) return [];
  const cap = Math.min(Math.max(limit, 1), 24);

  const scraped = await scrapeGet<{ artists?: TasteArtist[] }>(
    `/api/artists?q=${encodeURIComponent(q)}&limit=${cap}`
  );
  if (scraped?.artists?.length) {
    const list = scraped.artists.map((a) => ({ ...a, color: a.color || colorForId(a.id) }));
    prefetchArtistCovers(list, 'md');
    return list;
  }

  // Invidious channel search
  try {
    const data = await withInstances((base) =>
      fetchJson(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=channel`)
    );
    const list = Array.isArray(data) ? (data as { author?: string; authorId?: string; authorThumbnails?: { url: string; width: number }[] }[]) : [];
    const out: TasteArtist[] = [];
    for (const ch of list) {
      if (!ch.authorId || !ch.author) continue;
      const thumbs = [...(ch.authorThumbnails ?? [])].sort((a, b) => b.width - a.width);
      let image = thumbs[0]?.url || '';
      if (image.startsWith('//')) image = `https:${image}`;
      if (!image) continue;
      out.push({
        id: `ch_${ch.authorId}`,
        name: ch.author.replace(/\s*-\s*Topic\s*$/i, '').trim(),
        query: `${ch.author} official music`,
        image,
        color: colorForId(ch.authorId),
      });
      if (out.length >= cap) break;
    }
    if (out.length) {
      prefetchArtistCovers(out, 'md');
      return out;
    }
  } catch {
    // fall through
  }

  const tracks = await searchTracks(`${q} official`, 12);
  const seen = new Set<string>();
  const ranked: TasteArtist[] = [];
  for (const t of tracks) {
    const key = normalizeArtistName(t.artist);
    if (!key || seen.has(key) || !t.thumbnail) continue;
    seen.add(key);
    ranked.push({
      id: `art_${t.id}`,
      name: t.artist,
      query: `${t.artist} official music`,
      image: t.thumbnail,
      color: colorForId(t.id),
    });
    if (ranked.length >= cap) break;
  }
  prefetchArtistCovers(ranked, 'md');
  return ranked;
}

export async function hydrateArtistCovers(
  artists: TasteArtist[],
  onUpdate?: (list: TasteArtist[]) => void
): Promise<TasteArtist[]> {
  const cache = await loadArtistImageCache();
  const nextCache = { ...cache };
  const results = artists.map((a) => (cache[a.id] ? { ...a, image: cache[a.id] } : { ...a }));
  onUpdate?.(results.map((a) => ({ ...a })));

  const CONCURRENCY = 4;
  const push = () => onUpdate?.(results.map((a) => ({ ...a })));

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const batch = results.slice(i, i + CONCURRENCY).map((a, offset) => ({ a, idx: i + offset }));
    await Promise.all(
      batch.map(async ({ a, idx }) => {
        const cached = cache[a.id];
        if (cached && !cached.includes('i.ytimg.com/vi/')) return;
        try {
          const found = await searchArtists(a.name, 3);
          const match =
            found.find((f) => f.name.toLowerCase() === a.name.toLowerCase()) ?? found[0];
          let image = match?.image;
          if (!image) {
            const tracks = await searchTracks(a.query, 1);
            image = tracks[0]?.thumbnail;
          }
          if (image && image !== results[idx].image) {
            nextCache[a.id] = image;
            results[idx] = { ...a, image };
            push();
          } else if (image) {
            nextCache[a.id] = image;
          }
        } catch {
          // keep seed
        }
      })
    );
  }

  void saveArtistImageCache(nextCache);
  // Demus/Kingfisher: persist actual image bytes, not just URL strings
  prefetchArtistCovers(results, 'md');
  return results;
}

export async function getTrending(limit = 20): Promise<Track[]> {
  const scraped = await scrapeGet<{ tracks?: Track[] }>(`/api/trending?limit=${limit}`);
  if (scraped?.tracks?.length) return scraped.tracks.slice(0, limit);

  try {
    const data = await withInstances((base) => fetchJson(`${base}/api/v1/trending?type=music`));
    const list = Array.isArray(data) ? (data as InvidiousVideo[]) : [];
    const tracks = list
      .map(mapVideo)
      .filter((t): t is Track => Boolean(t))
      .slice(0, limit);
    if (tracks.length > 0) return tracks;
  } catch {
    // fall through
  }

  return searchTracks('music mix playlist', limit);
}

export async function getTracksByIds(ids: string[]): Promise<Track[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const scraped = await scrapeGet<{ tracks?: Track[] }>(
    `/api/videos?ids=${encodeURIComponent(unique.slice(0, 50).join(','))}`,
    20000
  );
  if (scraped?.tracks?.length) return scraped.tracks;

  const tracks: Track[] = [];
  for (const id of unique.slice(0, 20)) {
    try {
      const data = await withInstances((base) => fetchJson(`${base}/api/v1/videos/${id}`));
      const mapped = mapVideo(data as InvidiousVideo);
      if (mapped) tracks.push(mapped);
    } catch {
      // skip
    }
  }
  return tracks;
}

/** Ranked googlevideo URLs scraped on-device (see ytScrape.web.ts). */
export async function resolveDirectAudioCandidates(videoId: string): Promise<string[]> {
  const list = await scrapeAudioCandidates(videoId);
  return list.map((c) => c.url);
}

export function rememberWorkingStream(videoId: string, url: string): void {
  rememberScrapeHit(videoId, url);
}

export function peekCachedStreamUrl(videoId: string): string | null {
  return peekScrapeUrl(videoId);
}

export function invalidateCachedStream(videoId: string): void {
  forgetScrape(videoId);
  streamGen.set(videoId, (streamGen.get(videoId) || 0) + 1);
}

function warmMediaUrl(url: string) {
  if (typeof document === 'undefined' || !url) return;
  try {
    if (!warmerEl) {
      warmerEl = document.createElement('audio');
      warmerEl.preload = 'auto';
      warmerEl.muted = true;
      warmerEl.setAttribute('playsinline', 'true');
      Object.assign(warmerEl.style, {
        position: 'fixed',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
      document.body.appendChild(warmerEl);
    }
    if (warmerEl.src !== url) {
      warmerEl.src = url;
      warmerEl.load();
    }
  } catch {
    // ignore
  }
}

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  const cached = peekCachedStreamUrl(videoId);
  if (cached) return cached;
  const candidates = await resolveDirectAudioCandidates(videoId);
  if (!candidates.length) throw new Error('Nessuno stream audio');
  return candidates[0];
}

export function prefetchSearchResults(tracks: Track[], limit = 18): void {
  // Demus/Kingfisher: covers to disk first (instant list paint)
  prefetchTrackCovers(tracks.slice(0, limit), 'sm');
  // ytify: fill streamCache BEFORE tap — scrape first (browser → Inv), then /api/play
  const list = tracks.slice(0, limit);
  list.forEach((t, i) => {
    const delay = i < 8 ? 0 : Math.min((i - 7) * 120, 1200);
    window.setTimeout(() => {
      if (i < 14) {
        warmScrape(t.id);
        prefetchPlayResolve(t.id);
      }
      if (i < 6) warmAudioProxy(t.id);
      if (i < 10) prefetchAudioStream(t.id);
    }, delay);
  });
}

const warmProxyInflight = new Set<string>();
const warmProxyDone = new Map<string, number>();

/**
 * Warm the fast path before tap:
 * 1) /api/go — resolves URL + 302 (fills server urlCache)
 * 2) /api/audio — fills RAM head buffer as backup
 */
export function warmAudioProxy(videoId: string): void {
  if (!videoId || typeof window === 'undefined' || !window.location?.origin) return;
  const recent = warmProxyDone.get(videoId);
  if (recent && Date.now() - recent < 90_000) return;
  if (warmProxyInflight.has(videoId)) return;
  warmProxyInflight.add(videoId);
  const origin = window.location.origin;
  const go = `${origin}/api/go/${encodeURIComponent(videoId)}`;
  const audio = `${origin}/api/audio/${encodeURIComponent(videoId)}`;

  const mark = () => warmProxyDone.set(videoId, Date.now());

  // Tiny range after redirect — primes CDN + server resolve cache
  void fetch(go, {
    method: 'GET',
    headers: { Range: 'bytes=0-2047' },
    signal: AbortSignal.timeout(12000),
  })
    .then((res) => {
      if (res.ok || res.status === 206 || res.type === 'opaqueredirect') mark();
    })
    .catch(() => undefined);

  void fetch(audio, {
    method: 'GET',
    headers: { Range: 'bytes=0-65535' },
    signal: AbortSignal.timeout(15000),
  })
    .then((res) => {
      if (res.ok || res.status === 206) mark();
    })
    .catch(() => undefined)
    .finally(() => {
      warmProxyInflight.delete(videoId);
    });
}

export function prefetchAudioStream(videoId: string): void {
  if (!videoId) return;
  warmScrape(videoId);
  void scrapeAudioCandidates(videoId).then((list) => {
    const warm = list.find(
      (c) => c.source !== 'proxy:audio' && !c.url.includes('/api/audio/')
    );
    if (warm) warmMediaUrl(warm.url);
  });
}

export async function getRelated(videoId: string, limit = 16): Promise<Track[]> {
  const scraped = await scrapeGet<{ tracks?: Track[] }>(
    `/api/related/${encodeURIComponent(videoId)}?limit=${limit}`
  );
  if (scraped?.tracks?.length) return scraped.tracks.slice(0, limit);

  try {
    const data = await withInstances((base) => fetchJson(`${base}/api/v1/videos/${videoId}`));
    const related = (data as { recommendedVideos?: InvidiousVideo[] })?.recommendedVideos ?? [];
    return related
      .map(mapVideo)
      .filter((t): t is Track => Boolean(t))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatViews(count?: number): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M ascolti`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K ascolti`;
  return `${count} ascolti`;
}
