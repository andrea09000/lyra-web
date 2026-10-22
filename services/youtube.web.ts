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
  'https://yt.omada.cafe',
  'https://echostreamz.com',
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.schenkel.eti.br',
];

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.syncpundit.io',
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
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Wrong Vercel project / SPA rewrite often returns HTML 200 — never treat as JSON
    if (ct.includes('text/html')) throw new Error('HTML instead of JSON');
    const data = await res.json();
    if (data == null || typeof data !== 'object') throw new Error('invalid JSON');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeGet<T>(path: string, timeoutMs = 18000): Promise<T | null> {
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
      `${base}/api/v1/search?q=${encodeURIComponent(musicSearchQuery(query))}&type=video&sort_by=relevance`,
      6000
    )
  );
  const list = Array.isArray(data) ? (data as InvidiousVideo[]) : [];
  return list
    .map(mapVideo)
    .filter((t): t is Track => Boolean(t))
    .filter(looksLikeMusic)
    .slice(0, limit);
}

function videoIdFromUrl(url: string): string | null {
  const m = String(url || '').match(
    /[?&]v=([\w-]{11})|\/watch\?v=([\w-]{11})|youtu\.be\/([\w-]{11})|\/([\w-]{11})$/
  );
  return (m && (m[1] || m[2] || m[3] || m[4])) || null;
}

async function searchPipedClient(query: string, limit: number): Promise<Track[]> {
  const q = encodeURIComponent(musicSearchQuery(query));
  let lastErr: unknown;
  for (const base of PIPED_INSTANCES) {
    try {
      const data = (await fetchJson(`${base.replace(/\/$/, '')}/search?q=${q}&filter=videos`, 8000)) as {
        items?: { type?: string; url?: string; title?: string; uploaderName?: string; duration?: number; views?: number }[];
      };
      const tracks: Track[] = [];
      for (const item of data.items || []) {
        if (item.type !== 'stream' || !item.title) continue;
        const id = videoIdFromUrl(item.url || '');
        if (!id) continue;
        tracks.push({
          id,
          title: cleanTitle(item.title),
          artist: item.uploaderName || 'YouTube',
          thumbnail: ytThumb(id),
          duration: Number(item.duration || 0),
          viewCount: Number(item.views || 0) || undefined,
        });
        if (tracks.length >= limit) break;
      }
      const filtered = tracks.filter(looksLikeMusic);
      const out = filtered.length ? filtered : tracks;
      if (out.length) return out.slice(0, limit);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('piped empty');
}

function normalizeSearchHits(tracks: Track[]): Track[] {
  const filtered = tracks.filter(looksLikeMusic);
  return filtered.length ? filtered : tracks;
}

export async function searchTracks(query: string, limit = 24): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const cached = await getCachedSearch(q);
    if (cached && cached.length >= Math.min(limit, 8)) return cached.slice(0, limit);
  } catch {
    // miss
  }

  // Race same-origin API + browser mirrors — first non-empty wins (survives wrong/cold deploy)
  const racers: Promise<Track[]>[] = [
    scrapeGet<{ tracks?: Track[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`, 18000).then(
      (scraped) => {
        if (!scraped?.tracks?.length) throw new Error('api empty');
        return normalizeSearchHits(scraped.tracks);
      }
    ),
    searchPipedClient(q, limit),
    searchInvidious(q, limit),
  ];

  let tracks: Track[] = [];
  try {
    tracks = await Promise.any(racers);
  } catch {
    // all failed
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

function normalizeChannelImage(url?: string | null): string {
  if (!url) return '';
  let u = String(url).trim();
  if (!u) return '';
  if (u.startsWith('//')) u = `https:${u}`;
  try {
    const parsed = new URL(u);
    const host = parsed.searchParams.get('host');
    if (host && /(ggpht|googleusercontent)\.com$/i.test(host)) {
      return `https://${host}${parsed.pathname}`;
    }
  } catch {
    // keep
  }
  return u;
}

function dedupeArtistList(list: TasteArtist[]): TasteArtist[] {
  const out: TasteArtist[] = [];
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  for (const a of list) {
    if (!a?.id || !a?.name) continue;
    const key = normalizeArtistName(a.name);
    if (seenId.has(a.id) || (key && seenName.has(key))) continue;
    seenId.add(a.id);
    if (key) seenName.add(key);
    out.push({
      ...a,
      image: normalizeChannelImage(a.image) || a.image,
      color: a.color || colorForId(a.id),
    });
  }
  return out;
}

async function searchArtistsPiped(query: string, limit: number): Promise<TasteArtist[]> {
  let lastErr: unknown;
  for (const base of PIPED_INSTANCES) {
    try {
      const data = (await fetchJson(
        `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&filter=channels`,
        8000
      )) as {
        items?: {
          type?: string;
          url?: string;
          name?: string;
          thumbnail?: string;
          uploaderAvatar?: string;
        }[];
      };
      const out: TasteArtist[] = [];
      for (const item of data.items || []) {
        if (item.type !== 'channel' || !item.name) continue;
        const chId = String(item.url || '').replace(/^\/channel\//, '');
        if (!chId) continue;
        const name = item.name.replace(/\s*-\s*Topic\s*$/i, '').trim();
        out.push({
          id: `ch_${chId}`,
          name,
          query: `${name} official music`,
          image: normalizeChannelImage(item.thumbnail || item.uploaderAvatar || ''),
          color: colorForId(chId),
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('piped channels empty');
}

async function searchArtistsInvidious(query: string, limit: number): Promise<TasteArtist[]> {
  const data = await withInstances((base) =>
    fetchJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=channel`, 6000)
  );
  const list = Array.isArray(data)
    ? (data as {
        author?: string;
        authorId?: string;
        authorThumbnails?: { url: string; width: number }[];
      }[])
    : [];
  const out: TasteArtist[] = [];
  for (const ch of list) {
    if (!ch.authorId || !ch.author) continue;
    const thumbs = [...(ch.authorThumbnails ?? [])].sort((a, b) => b.width - a.width);
    const name = ch.author.replace(/\s*-\s*Topic\s*$/i, '').trim();
    out.push({
      id: `ch_${ch.authorId}`,
      name,
      query: `${name} official music`,
      image: normalizeChannelImage(thumbs[0]?.url || ''),
      color: colorForId(ch.authorId),
    });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('invidious channels empty');
  return out;
}

async function searchArtistsFromTracks(query: string, limit: number): Promise<TasteArtist[]> {
  const tracks = await searchTracks(`${query} official`, Math.max(limit * 3, 18));
  const ranked: TasteArtist[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    const key = normalizeArtistName(t.artist);
    if (!key || key === 'youtube' || seen.has(key)) continue;
    seen.add(key);
    ranked.push({
      id: `art_${t.id}`,
      name: t.artist,
      query: `${t.artist} official music`,
      image: t.thumbnail || ytThumb(t.id),
      color: colorForId(t.id),
    });
    if (ranked.length >= limit) break;
  }
  if (!ranked.length) throw new Error('track artists empty');
  return ranked;
}

export async function searchArtists(query: string, limit = 1): Promise<TasteArtist[]> {
  const q = query.trim();
  if (!q) return [];
  const cap = Math.min(Math.max(limit, 1), 16);

  const racers: Promise<TasteArtist[]>[] = [
    scrapeGet<{ artists?: TasteArtist[] }>(
      `/api/artists?q=${encodeURIComponent(q)}&limit=${cap}`,
      14000
    ).then((scraped) => {
      if (!scraped?.artists?.length) throw new Error('api artists empty');
      return scraped.artists;
    }),
    searchArtistsPiped(q, cap),
    searchArtistsInvidious(q, cap),
    searchArtistsFromTracks(q, cap),
  ];

  try {
    const first = await Promise.any(racers);
    return dedupeArtistList(first).slice(0, cap);
  } catch {
    return [];
  }
}

function isUsableArtistImage(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (!u.startsWith('http')) return false;
  // Prefer stable YouTube thumbs; reject empty/placeholder channel blobs
  if (u.includes('i.ytimg.com/vi/')) return true;
  if (u.includes('yt3.ggpht.com') || u.includes('googleusercontent.com')) return true;
  return u.length > 12;
}

export async function hydrateArtistCovers(
  artists: TasteArtist[],
  onUpdate?: (list: TasteArtist[]) => void
): Promise<TasteArtist[]> {
  // Show curated seeds first — never blank the grid waiting on network
  onUpdate?.(artists.map((a) => ({ ...a })));

  let cache: Record<string, string> = {};
  try {
    cache = await loadArtistImageCache();
  } catch {
    cache = {};
  }
  const nextCache = { ...cache };
  const results = artists.map((a) => {
    const cached = cache[a.id];
    if (isUsableArtistImage(cached)) return { ...a, image: cached };
    return { ...a };
  });
  onUpdate?.(results.map((a) => ({ ...a })));

  const CONCURRENCY = 3;
  const push = () => onUpdate?.(results.map((a) => ({ ...a })));

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const batch = results.slice(i, i + CONCURRENCY).map((a, offset) => ({ a, idx: i + offset }));
    await Promise.all(
      batch.map(async ({ a, idx }) => {
        // Keep good YouTube video thumbs — only upgrade missing/broken covers
        if (isUsableArtistImage(results[idx].image) && results[idx].image.includes('i.ytimg.com/vi/')) {
          return;
        }
        try {
          const found = await searchArtists(a.name, 3);
          const match =
            found.find((f) => f.name.toLowerCase() === a.name.toLowerCase()) ?? found[0];
          let image = match?.image;
          if (!isUsableArtistImage(image)) {
            const tracks = await searchTracks(a.query, 1);
            image = tracks[0]?.thumbnail;
          }
          if (isUsableArtistImage(image) && image !== results[idx].image) {
            nextCache[a.id] = image!;
            results[idx] = { ...results[idx], image: image! };
            push();
          }
        } catch {
          // keep seed thumb
        }
      })
    );
  }

  void saveArtistImageCache(nextCache);
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
  // First hits: warm same-origin AAC proxy so tap → play doesn't wait on cold getHead
  for (const t of tracks.slice(0, Math.min(4, limit))) {
    warmAudioProxy(t.id);
  }
  for (const t of tracks.slice(0, limit)) prefetchAudioStream(t.id);
}

/** Hit /api/audio so Vercel caches the stream head before the user taps play. */
export function warmAudioProxy(videoId: string): void {
  if (!videoId || typeof window === 'undefined' || !window.location?.origin) return;
  const url = `${window.location.origin}/api/audio/${encodeURIComponent(videoId)}`;
  void fetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-1' },
    signal: AbortSignal.timeout(20000),
  }).catch(() => undefined);
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
