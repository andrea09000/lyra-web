import { TasteArtist, Track } from '@/types/music';
import { loadArtistImageCache, saveArtistImageCache } from '@/services/storage';
import { getCachedSearch, setCachedSearch } from '@/services/searchCache';

const YT_API = 'https://www.googleapis.com/youtube/v3';

const SEED_INSTANCES = [
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://yewtu.be',
];

let discoveredInstances: string[] | null = null;

function getApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY?.trim();
  return key ? key : null;
}

/** Official Data API when a key is set; on quota/errors we fall back to Invidious. */
function useOfficialYtApi(): boolean {
  return Boolean(getApiKey());
}

export function hasYoutubeApiKey(): boolean {
  return useOfficialYtApi();
}

type InvidiousVideo = {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  videoThumbnails?: { quality: string; url: string }[];
  lengthSeconds?: number;
  viewCount?: number;
};

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
};

type YtVideoItem = {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
};

function cleanTitle(title: string): string {
  return title
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/official\s*audio/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseIsoDuration(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function ytThumb(id: string, quality: 'mq' | 'hq' = 'mq'): string {
  return `https://i.ytimg.com/vi/${id}/${quality === 'hq' ? 'hq' : 'mq'}default.jpg`;
}

function pickYtThumb(snippet?: YtSearchItem['snippet'], videoId?: string): string {
  // Prefer compact CDN size — high/maxres kill list scroll
  const medium = snippet?.thumbnails?.medium?.url;
  if (medium) return medium;
  if (videoId) return ytThumb(videoId, 'mq');
  return (
    snippet?.thumbnails?.default?.url ||
    snippet?.thumbnails?.high?.url ||
    ''
  );
}

function pickThumbnail(video: InvidiousVideo): string {
  if (video.videoId) return ytThumb(video.videoId, 'mq');
  const thumbs = video.videoThumbnails ?? [];
  const preferred =
    thumbs.find((t) => t.quality === 'medium') ||
    thumbs.find((t) => t.quality === 'default') ||
    thumbs[0];
  if (preferred?.url?.startsWith('http')) return preferred.url;
  return '';
}

function mapVideo(video: InvidiousVideo): Track | null {
  if (!video.videoId || !video.title) return null;
  if (video.type && video.type !== 'video') return null;
  return {
    id: video.videoId,
    title: cleanTitle(video.title),
    artist: video.author || 'YouTube',
    thumbnail: pickThumbnail(video),
    duration: video.lengthSeconds ?? 0,
    viewCount: video.viewCount,
  };
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
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

async function getInvidiousInstances(): Promise<string[]> {
  if (discoveredInstances?.length) return discoveredInstances;
  try {
    const data = (await fetchJson('https://api.invidious.io/instances.json', 6000)) as [
      string,
      { api?: boolean; type?: string; uri?: string },
    ][];
    const live = data
      .filter(([, meta]) => meta?.api === true && meta?.type === 'https' && meta?.uri)
      .map(([, meta]) => meta.uri as string);
    discoveredInstances = [...new Set([...SEED_INSTANCES, ...live])];
  } catch {
    discoveredInstances = SEED_INSTANCES;
  }
  return discoveredInstances;
}

async function withInstances<T>(runner: (base: string) => Promise<T>): Promise<T> {
  // Prefer seeds first (known-good); only probe a few so search/play stay fast
  const instances = [...SEED_INSTANCES];
  if (!discoveredInstances) {
    void getInvidiousInstances();
  } else {
    for (const b of discoveredInstances) {
      if (!instances.includes(b)) instances.push(b);
      if (instances.length >= 6) break;
    }
  }
  let lastError: unknown;
  // Race first 3 in parallel, then fall through sequentially if all fail
  const first = instances.slice(0, 3).map((base) => runner(base.replace(/\/$/, '')));
  try {
    return await raceFirst(first);
  } catch (error) {
    lastError = error;
  }
  for (const base of instances.slice(3)) {
    try {
      return await runner(base.replace(/\/$/, ''));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Nessuna istanza disponibile');
}

function mapYtVideoItem(item: YtVideoItem): Track | null {
  const id = item.id;
  const title = item.snippet?.title;
  if (!id || !title) return null;
  return {
    id,
    title: cleanTitle(title),
    artist: item.snippet?.channelTitle || 'YouTube',
    thumbnail: pickYtThumb(item.snippet, id),
    duration: parseIsoDuration(item.contentDetails?.duration),
    viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined,
  };
}

/**
 * `videos.list` — 1 quota unit per call (up to 50 ids).
 * Use this whenever you already know video IDs (library, favorites, refresh).
 */
export async function getTracksByIds(ids: string[]): Promise<Track[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return [];

  if (useOfficialYtApi()) {
    const key = getApiKey();
    if (key) {
      try {
        const out: Track[] = [];
        for (let i = 0; i < unique.length; i += 50) {
          const chunk = unique.slice(i, i + 50);
          const data = (await fetchJson(
            `${YT_API}/videos?part=snippet,contentDetails,statistics&id=${chunk.join(',')}&key=${key}`
          )) as { items?: YtVideoItem[] };
          const byId = new Map<string, Track>();
          for (const item of data.items ?? []) {
            const track = mapYtVideoItem(item);
            if (track) byId.set(track.id, track);
          }
          for (const id of chunk) {
            const t = byId.get(id);
            if (t) out.push(t);
          }
        }
        if (out.length > 0) return out;
      } catch {
        // fall through to Invidious
      }
    }
  }

  const tracks: Track[] = [];
  for (const id of unique.slice(0, 20)) {
    try {
      const data = await withInstances((base) => fetchJson(`${base}/api/v1/videos/${id}`));
      const mapped = mapVideo(data as InvidiousVideo);
      if (mapped) tracks.push(mapped);
    } catch {
      // skip missing ids
    }
  }
  return tracks;
}

async function enrichDurations(tracks: Track[]): Promise<Track[]> {
  if (!useOfficialYtApi() || tracks.length === 0) return tracks;
  try {
    const fresh = await getTracksByIds(tracks.map((t) => t.id));
    if (!fresh.length) return tracks;
    const map = new Map(fresh.map((t) => [t.id, t]));
    return tracks.map((t) => {
      const extra = map.get(t.id);
      if (!extra) return t;
      return {
        ...t,
        duration: extra.duration || t.duration,
        viewCount: extra.viewCount ?? t.viewCount,
        title: t.title || extra.title,
        artist: t.artist || extra.artist,
        thumbnail: t.thumbnail || extra.thumbnail,
      };
    });
  } catch {
    return tracks;
  }
}

/** Drop tutorials, podcasts, long non-music videos, etc. */
const NON_MUSIC_RE =
  /\b(tutorial|how\s*to|lesson|lezione|corso|reaction|review|recensione|podcast|trailer|gameplay|unboxing|explained|documentary|documentario|vlog|makeup|recipe|ricetta|news|notizie|interview|intervista|behind the scenes|making of|speedrun|walkthrough|asmr(?!\s*music))\b/i;

function looksLikeMusic(track: Track): boolean {
  const title = track.title || '';
  if (NON_MUSIC_RE.test(title)) return false;
  if (track.duration > 0) {
    if (track.duration < 40) return false;
    const longOk = /\b(mix|playlist|album|full album|dj set|live|concert|concerto|set|compilation|hour)\b/i.test(
      title
    );
    if (track.duration > 22 * 60 && !longOk) return false;
  }
  return true;
}

function musicSearchQuery(query: string): string {
  const q = query.trim();
  if (/\b(music|song|audio|official|mix|lyrics|track|musica|canzone)\b/i.test(q)) return q;
  return `${q} music`;
}

async function searchOfficial(query: string, limit: number): Promise<Track[]> {
  const key = getApiKey();
  if (!key) throw new Error('No API key');
  const fetchCount = Math.min(Math.max(limit * 2, 10), 50);
  const data = (await fetchJson(
    `${YT_API}/search?part=snippet&type=video&videoCategoryId=10&maxResults=${fetchCount}&q=${encodeURIComponent(musicSearchQuery(query))}&key=${key}`
  )) as { items?: YtSearchItem[] };

  const tracks = (data.items ?? [])
    .map((item): Track | null => {
      const id = item.id?.videoId;
      const title = item.snippet?.title;
      if (!id || !title) return null;
      return {
        id,
        title: cleanTitle(title),
        artist: item.snippet?.channelTitle || 'YouTube',
        thumbnail: pickYtThumb(item.snippet, id),
        duration: 0,
      };
    })
    .filter((t): t is Track => Boolean(t));

  const enriched = await enrichDurations(tracks);
  return enriched.filter(looksLikeMusic).slice(0, limit);
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

  // Shared cache first — same normalized query never re-hits YouTube search (100 units)
  try {
    const cached = await getCachedSearch(q);
    if (cached && cached.length >= limit) return cached.slice(0, limit);
  } catch {
    // cache miss / offline
  }

  let tracks: Track[] = [];

  // search = 100 units — only for first discovery of a query
  if (useOfficialYtApi()) {
    try {
      tracks = await searchOfficial(q, limit);
    } catch {
      // quota exceeded or API down → fallback
    }
  }

  if (!tracks.length) {
    try {
      tracks = await searchInvidious(q, limit);
    } catch {
      return [];
    }
  }

  if (tracks.length > 0) {
    void setCachedSearch(q, tracks);
  }
  return tracks.slice(0, limit);
}

const ARTIST_COLORS = [
  '#2D6A4F',
  '#1B4332',
  '#081C15',
  '#40916C',
  '#52B788',
  '#145C38',
  '#0B1A12',
];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % ARTIST_COLORS.length;
  return ARTIST_COLORS[h];
}

type YtChannelItem = {
  id?: { channelId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
      default?: { url?: string };
    };
  };
};

type InvidiousChannel = {
  type?: string;
  author?: string;
  authorId?: string;
  authorThumbnails?: { url: string; width: number }[];
  authorVerified?: boolean;
  autoGenerated?: boolean;
  subCount?: number;
};

type RankedChannel = {
  artist: TasteArtist;
  score: number;
};

const JUNK_CHANNEL =
  /(radio|podcast|lyrics?|fan\s*page|covers?|news|sports?|\btv\b|online|reaction|karaoke|instrumental|remixes?|live\s*stream|channel|mcpe|minecraft|roblox|gameplay|gaming)/i;

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

function mapChannelToArtist(id: string, name: string, image: string): TasteArtist | null {
  if (!id || !name) return null;
  return {
    id: `ch_${id}`,
    name: name.replace(/\s*-\s*Topic\s*$/i, '').trim(),
    query: `${name} official music`,
    image,
    color: colorForId(id),
  };
}

/** Prefer the real main artist profile — drop Topic/fan/radio clones. */
function scoreChannel(
  query: string,
  name: string,
  meta?: { verified?: boolean; autoGenerated?: boolean; subCount?: number }
): number {
  const q = normalizeArtistName(query);
  const n = normalizeArtistName(name);
  if (!q || !n) return -999;
  if (JUNK_CHANNEL.test(name)) return -999;
  if (meta?.autoGenerated || /\btopic\b/i.test(name)) return -999;

  let score = 0;
  if (n === q) score += 100; // exact "BLANCO" / "Drake"
  else if (n.startsWith(`${q} `)) score += 75; // "Sfera Ebbasta"
  else if (n.split(' ').some((w) => w === q)) score += 45;
  else if (n.startsWith(q)) score += 20; // compound "blancolirio" — weaker
  else if (n.includes(q)) score += 15;
  else return -999; // unrelated name

  if (meta?.verified) score += 40;
  if (/\bofficial\b/i.test(name)) score += 35;

  // Subs dominate: millions beat tiny verified clones
  const subs = meta?.subCount ?? 0;
  if (subs > 0) score += Math.min(220, Math.log10(subs + 1) * 28);
  else score -= 20;

  return score;
}

/** Always keep only the main profile(s) — never a wall of fan clones. */
function pickMainArtists(_query: string, ranked: RankedChannel[], limit: number): TasteArtist[] {
  const sorted = ranked
    .filter((r) => r.score >= 40)
    .sort((a, b) => b.score - a.score);

  if (!sorted.length) return [];

  // Default: only the #1 official profile
  if (limit <= 1) return [sorted[0].artist];

  const seen = new Set<string>();
  const out: TasteArtist[] = [];
  for (const row of sorted) {
    const key = normalizeArtistName(row.artist.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.artist);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchArtistsOfficial(query: string, limit: number): Promise<TasteArtist[]> {
  const key = getApiKey();
  if (!key) throw new Error('No API key');
  const data = (await fetchJson(
    `${YT_API}/search?part=snippet&type=channel&maxResults=15&q=${encodeURIComponent(query)}&key=${key}`
  )) as { items?: YtChannelItem[] };

  const ranked: RankedChannel[] = [];
  for (const item of data.items ?? []) {
    const id = item.id?.channelId;
    const name = item.snippet?.title || item.snippet?.channelTitle;
    const image =
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.default?.url ||
      '';
    if (!id || !name || !image) continue;
    const artist = mapChannelToArtist(id, name, image);
    if (!artist) continue;
    ranked.push({ artist, score: scoreChannel(query, name) });
  }
  return pickMainArtists(query, ranked, limit);
}

async function searchArtistsInvidious(query: string, limit: number): Promise<TasteArtist[]> {
  const data = await withInstances((base) =>
    fetchJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=channel`)
  );
  const list = Array.isArray(data) ? (data as InvidiousChannel[]) : [];
  const ranked: RankedChannel[] = [];

  for (const ch of list) {
    if (ch.type && ch.type !== 'channel') continue;
    const id = ch.authorId;
    const name = ch.author;
    const thumbs = [...(ch.authorThumbnails ?? [])].sort((a, b) => b.width - a.width);
    let image = thumbs[0]?.url || '';
    if (image.startsWith('//')) image = `https:${image}`;
    if (!id || !name || !image) continue;
    const artist = mapChannelToArtist(id, name, image);
    if (!artist) continue;
    ranked.push({
      artist,
      score: scoreChannel(query, name, {
        verified: ch.authorVerified,
        autoGenerated: ch.autoGenerated,
        subCount: ch.subCount,
      }),
    });
  }

  return pickMainArtists(query, ranked, limit);
}

/** Search artists — returns only the main official profile(s), not fan/Topic clones. */
export async function searchArtists(query: string, limit = 1): Promise<TasteArtist[]> {
  const q = query.trim();
  if (!q) return [];
  const cap = Math.min(Math.max(limit, 1), 3);

  if (useOfficialYtApi()) {
    try {
      const artists = await searchArtistsOfficial(q, cap);
      if (artists.length > 0) return artists;
    } catch {
      // quota / error → Invidious
    }
  }

  try {
    const artists = await searchArtistsInvidious(q, cap);
    if (artists.length > 0) return artists;
  } catch {
    // video-thumb fallback below
  }

  const tracks = await searchTracks(`${q} official`, 12);
  const seen = new Set<string>();
  const ranked: RankedChannel[] = [];
  for (const t of tracks) {
    const key = normalizeArtistName(t.artist);
    if (!key || seen.has(key) || !t.thumbnail) continue;
    seen.add(key);
    const artist: TasteArtist = {
      id: `art_${t.id}`,
      name: t.artist,
      query: `${t.artist} official music`,
      image: t.thumbnail,
      color: colorForId(t.id),
    };
    ranked.push({ artist, score: scoreChannel(q, t.artist) });
  }
  return pickMainArtists(q, ranked, cap);
}

/**
 * Refresh curated artist covers from cache / live search.
 * Keeps seed thumbs immediately; upgrades to channel avatars when found.
 * Calls onUpdate as each cover arrives so the UI never stays blank.
 */
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
        // Skip network if we already have a non-seed channel/cdn cover cached
        const cached = cache[a.id];
        if (cached && !cached.includes('i.ytimg.com/vi/')) {
          return;
        }
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
          // keep seed / cached fallback
        }
      })
    );
  }

  void saveArtistImageCache(nextCache);
  return results;
}

async function trendingOfficial(limit: number): Promise<Track[]> {
  const key = getApiKey();
  if (!key) throw new Error('No API key');
  const maxResults = Math.min(Math.max(limit, 1), 50);
  const data = (await fetchJson(
    `${YT_API}/videos?part=snippet,contentDetails,statistics&chart=mostPopular&videoCategoryId=10&regionCode=IT&maxResults=${maxResults}&key=${key}`
  )) as { items?: YtVideoItem[] };

  return (data.items ?? [])
    .map(mapYtVideoItem)
    .filter((t): t is Track => Boolean(t))
    .slice(0, limit);
}

export async function getTrending(limit = 20): Promise<Track[]> {
  if (useOfficialYtApi()) {
    try {
      const tracks = await trendingOfficial(limit);
      if (tracks.length > 0) return tracks;
    } catch {
      // quota → Invidious
    }
  }

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

type StreamFormat = {
  type?: string;
  url?: string;
  bitrate?: string | number;
  container?: string;
};

const STREAM_TIMEOUT_MS = 900;
const STREAM_CACHE_TTL_MS = 25 * 60 * 1000;
/** Keep the race small — too many mirrors saturates the phone radios and delays embed. */
const PIPED_BASES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
];

const streamCache = new Map<string, { url: string; expires: number }>();
let preferredStreamBase: string | null = 'https://invidious.f5.si';

function pickBestAudioUrl(formats: StreamFormat[], instanceBase?: string): string | null {
  const audio = formats.filter(
    (f) => f.url && typeof f.type === 'string' && f.type.startsWith('audio/')
  );
  if (!audio.length) return null;

  // Prefer m4a/mp4 for iOS (webm/opus often silent there)
  const sorted = [...audio].sort((a, b) => {
    const aMp4 = a.type?.includes('mp4') || a.container === 'm4a' ? 1 : 0;
    const bMp4 = b.type?.includes('mp4') || b.container === 'm4a' ? 1 : 0;
    if (aMp4 !== bMp4) return bMp4 - aMp4;
    return Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0);
  });

  const preferred = sorted[0];
  if (!preferred?.url) return null;
  if (preferred.url.startsWith('http')) return preferred.url;
  if (instanceBase && preferred.url.startsWith('/')) return `${instanceBase}${preferred.url}`;
  return preferred.url;
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

async function streamFromInvidious(base: string, videoId: string): Promise<string> {
  const clean = base.replace(/\/$/, '');
  const data = (await fetchJson(`${clean}/api/v1/videos/${videoId}`, STREAM_TIMEOUT_MS)) as {
    adaptiveFormats?: StreamFormat[];
    formatStreams?: StreamFormat[];
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  const url = pickBestAudioUrl(
    [...(data.adaptiveFormats ?? []), ...(data.formatStreams ?? [])],
    clean
  );
  if (!url) throw new Error('Nessuno stream audio');
  preferredStreamBase = clean;
  return url;
}

async function streamFromPiped(base: string, videoId: string): Promise<string> {
  const clean = base.replace(/\/$/, '');
  const data = (await fetchJson(`${clean}/streams/${videoId}`, STREAM_TIMEOUT_MS)) as {
    audioStreams?: { url?: string; bitrate?: number; mimeType?: string }[];
  };
  const streams = (data.audioStreams ?? [])
    .filter((s) => s.url)
    .sort((a, b) => {
      const aMp4 = a.mimeType?.includes('mp4') ? 1 : 0;
      const bMp4 = b.mimeType?.includes('mp4') ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      return (b.bitrate ?? 0) - (a.bitrate ?? 0);
    });
  if (!streams[0]?.url) throw new Error('Nessuno stream Piped');
  preferredStreamBase = clean;
  return streams[0].url;
}

function getCachedStream(videoId: string): string | null {
  const hit = streamCache.get(videoId);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    streamCache.delete(videoId);
    return null;
  }
  return hit.url;
}

function putCachedStream(videoId: string, url: string) {
  streamCache.set(videoId, { url, expires: Date.now() + STREAM_CACHE_TTL_MS });
}

/** Sync peek — use for instant play without awaiting network. */
export function peekCachedStreamUrl(videoId: string): string | null {
  return getCachedStream(videoId);
}

/** Drop a bad URL so the next resolve doesn't reuse a dead stream link. */
export function invalidateCachedStream(videoId: string): void {
  streamCache.delete(videoId);
}

/** Remember a URL that actually played (web hybrid upgrade path). */
export function rememberWorkingStream(videoId: string, url: string): void {
  putCachedStream(videoId, url);
}

/** Candidate direct audio URLs for background <audio> (native: single best). */
export async function resolveDirectAudioCandidates(videoId: string): Promise<string[]> {
  try {
    const url = await getAudioStreamUrl(videoId);
    return url ? [url] : [];
  } catch {
    return [];
  }
}

/** Resolve audio URL fast: cache → race preferred + few mirrors (max 3). */
export async function getAudioStreamUrl(videoId: string): Promise<string> {
  const cached = getCachedStream(videoId);
  if (cached) return cached;

  const tasks: Promise<string>[] = [];
  const seen = new Set<string>();
  const add = (base: string, kind: 'inv' | 'piped') => {
    if (seen.has(base) || tasks.length >= 3) return;
    seen.add(base);
    tasks.push(kind === 'piped' ? streamFromPiped(base, videoId) : streamFromInvidious(base, videoId));
  };

  if (preferredStreamBase) {
    add(preferredStreamBase, preferredStreamBase.includes('piped') ? 'piped' : 'inv');
  }
  for (const base of SEED_INSTANCES) add(base, 'inv');
  for (const base of PIPED_BASES) add(base, 'piped');

  const url = await raceFirst(tasks);
  putCachedStream(videoId, url);
  return url;
}

/** Prefetch stream URLs for a result list so the first tap often hits cache. */
export function prefetchSearchResults(tracks: Track[], limit = 6): void {
  for (const t of tracks.slice(0, limit)) {
    prefetchAudioStream(t.id);
  }
}

/** Web: warm /api/audio. Native: no-op (expo-av path). */
export function warmAudioProxy(_videoId: string): void {
  // implemented in youtube.web.ts
}

/** Warm cache for upcoming tracks without blocking playback. */
export function prefetchAudioStream(videoId: string): void {
  if (!videoId || getCachedStream(videoId)) return;
  void getAudioStreamUrl(videoId).catch(() => undefined);
}

export async function getRelated(videoId: string, limit = 16): Promise<Track[]> {
  if (useOfficialYtApi()) {
    const key = getApiKey();
    if (key) {
      try {
        const meta = (await fetchJson(
          `${YT_API}/videos?part=snippet&id=${videoId}&key=${key}`
        )) as { items?: YtVideoItem[] };
        const title = meta.items?.[0]?.snippet?.title;
        const channel = meta.items?.[0]?.snippet?.channelTitle;
        if (title) {
          const tracks = await searchTracks(`${channel ?? ''} ${title}`.trim(), limit);
          if (tracks.length > 0) return tracks;
        }
      } catch {
        // quota → Invidious
      }
    }
  }

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
