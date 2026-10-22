/**
 * YouTube audio scrape — race mirrors, return ASAP, keep filling cache.
 */

export type AudioCandidate = {
  url: string;
  source: string;
  mime?: string;
  bitrate?: number;
};

/** Lean set of usually-alive mirrors (dead hosts waste race time). */
const INV = [
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.jing.rocks',
  'https://yt.omada.cafe',
];

const PIPED = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
];

const cache = new Map<string, { urls: AudioCandidate[]; expires: number }>();
const inflight = new Map<string, Promise<AudioCandidate[]>>();
const CACHE_TTL = 25 * 60 * 1000;
/** v3: prefer AAC/MP4 for Safari — invalidate old Opus-first rankings */
const LS_KEY = 'lyra-scrape-cache-v3';

type DiskEntry = { urls: AudioCandidate[]; expires: number };

function readDisk(): Record<string, DiskEntry> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DiskEntry>;
  } catch {
    return {};
  }
}

function writeDisk(videoId: string, entry: DiskEntry) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const all = readDisk();
    all[videoId] = entry;
    // Cap entries
    const keys = Object.keys(all);
    if (keys.length > 80) {
      keys
        .sort((a, b) => (all[a].expires || 0) - (all[b].expires || 0))
        .slice(0, keys.length - 60)
        .forEach((k) => delete all[k]);
    }
    sessionStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // quota / private mode
  }
}

function hydrateFromDisk(videoId: string): AudioCandidate[] | null {
  const all = readDisk();
  const hit = all[videoId];
  if (!hit || hit.expires <= Date.now() || !hit.urls?.length) return null;
  cache.set(videoId, hit);
  return hit.urls;
}

async function fetchJson(url: string, ms = 1600): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** YouTube sometimes reports kbps (160) vs bps (160000). */
function normalizeBitrate(raw?: number | string): number {
  const n = Number(raw || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Values under ~2000 are almost always kbps
  return n < 2000 ? n * 1000 : n;
}

function isSafariSafeMime(mime?: string): boolean {
  const m = String(mime || '').toLowerCase();
  return m.includes('mp4') || m.includes('m4a') || m.includes('mp4a') || m.includes('aac');
}

/** True when this browser cannot play WebM/Opus (Safari / iOS). */
function browserNeedsMp4(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const el = document.createElement('audio');
    const webm = el.canPlayType('audio/webm; codecs="opus"');
    return !webm;
  } catch {
    return true;
  }
}

/**
 * Quality score for HTML5 playback.
 * On Safari/iOS, AAC/MP4 must win over higher-bitrate Opus (unplayable).
 */
function qualityScore(c: AudioCandidate): number {
  const br = normalizeBitrate(c.bitrate);
  const safe = isSafariSafeMime(c.mime);
  const needsMp4 = browserNeedsMp4();
  // Huge boost so 128k AAC beats 160k Opus when Safari can't decode WebM
  const safariBoost = needsMp4 && safe ? 1_000_000 : safe ? 50_000 : 0;
  const cors =
    c.source.includes('inv-proxy') || c.source.startsWith('fallback:') || c.source.includes('piped')
      ? 40
      : 0;
  return br + safariBoost + cors;
}

function isServerAudioProxy(c: AudioCandidate): boolean {
  return c.source === 'proxy:audio' || c.url.includes('/api/audio/');
}

function sortCandidates(list: AudioCandidate[]): AudioCandidate[] {
  return [...list].sort((a, b) => {
    // Same-origin proxy always last — used as reliability fallback, not HQ source
    const aLast = isServerAudioProxy(a) ? 1 : 0;
    const bLast = isServerAudioProxy(b) ? 1 : 0;
    if (aLast !== bLast) return aLast - bLast;
    return qualityScore(b) - qualityScore(a);
  });
}

function proxiedThroughInstance(rawUrl: string, instanceBase: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes('googlevideo.com') && !u.pathname.includes('videoplayback')) {
      return null;
    }
    const base = instanceBase.replace(/\/$/, '');
    return `${base}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

async function scrapeInvidious(base: string, videoId: string): Promise<AudioCandidate[]> {
  const clean = base.replace(/\/$/, '');
  const data = (await fetchJson(`${clean}/api/v1/videos/${videoId}`, 2000)) as {
    error?: string;
    adaptiveFormats?: { url?: string; type?: string; bitrate?: string | number; container?: string }[];
    formatStreams?: { url?: string; type?: string; bitrate?: string | number; container?: string }[];
  };
  if (data.error) throw new Error(data.error);

  const formats = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])]
    .filter((f) => f.url && typeof f.type === 'string' && f.type.startsWith('audio/'))
    .sort((a, b) => {
      const aSafe = isSafariSafeMime(a.type) ? 1 : 0;
      const bSafe = isSafariSafeMime(b.type) ? 1 : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;
      return normalizeBitrate(b.bitrate) - normalizeBitrate(a.bitrate);
    });

  const out: AudioCandidate[] = [];
  const host = new URL(clean).hostname;

  for (const f of formats) {
    let raw = String(f.url);
    if (!raw.startsWith('http')) raw = `${clean}${raw}`;
    const br = normalizeBitrate(f.bitrate) || undefined;

    const proxied = proxiedThroughInstance(raw, clean);
    if (proxied) {
      out.push({
        url: proxied,
        source: `inv-proxy:${host}`,
        mime: f.type,
        bitrate: br,
      });
    }
    out.push({
      url: raw,
      source: `inv:${host}`,
      mime: f.type,
      bitrate: br,
    });
  }
  if (!out.length) throw new Error('no audio');
  return out;
}

async function scrapePiped(base: string, videoId: string): Promise<AudioCandidate[]> {
  const clean = base.replace(/\/$/, '');
  const data = (await fetchJson(`${clean}/streams/${videoId}`, 2000)) as {
    audioStreams?: { url?: string; bitrate?: number; mimeType?: string }[];
  };
  const streams = [...(data.audioStreams || [])]
    .filter((s) => s.url)
    .sort((a, b) => {
      const aSafe = isSafariSafeMime(a.mimeType) ? 1 : 0;
      const bSafe = isSafariSafeMime(b.mimeType) ? 1 : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;
      return normalizeBitrate(b.bitrate) - normalizeBitrate(a.bitrate);
    });

  const out: AudioCandidate[] = [];
  for (const s of streams) {
    out.push({
      url: String(s.url),
      source: `piped:${new URL(clean).hostname}`,
      mime: s.mimeType,
      bitrate: normalizeBitrate(s.bitrate) || undefined,
    });
  }
  if (!out.length) throw new Error('no piped');
  return out;
}

async function scrapeServerFallback(videoId: string): Promise<AudioCandidate[]> {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  if (!origin) return [];
  const res = await fetch(`${origin}/api/s/${encodeURIComponent(videoId)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`api/s ${res.status}`);
  const data = (await res.json()) as {
    adaptiveFormats?: { url?: string; type?: string; bitrate?: string }[];
    source?: string;
  };
  const formats = [...(data.adaptiveFormats || [])]
    .filter((f) => f.url && !f.url.includes('/api/audio/'))
    .sort((a, b) => normalizeBitrate(b.bitrate) - normalizeBitrate(a.bitrate));

  const out: AudioCandidate[] = [];
  for (const f of formats) {
    out.push({
      url: f.url!,
      source: `fallback:${data.source || 'innertube'}`,
      mime: f.type,
      bitrate: normalizeBitrate(f.bitrate) || undefined,
    });
  }
  return out;
}

function dedupe(list: AudioCandidate[]): AudioCandidate[] {
  const seen = new Set<string>();
  const out: AudioCandidate[] = [];
  for (const c of list) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

function appendProxy(videoId: string, list: AudioCandidate[]): AudioCandidate[] {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  if (!origin) return list;
  // Bitrate 0 → always sorted last by qualityScore; never compete with HQ directs
  return [
    ...list,
    {
      url: `${origin}/api/audio/${encodeURIComponent(videoId)}`,
      source: 'proxy:audio',
      mime: 'audio/mp4',
      bitrate: 0,
    },
  ];
}

function finalize(videoId: string, urls: AudioCandidate[]): AudioCandidate[] {
  // Keep more HQ candidates for failover (Opus 160 → AAC 128 → …)
  const ranked = sortCandidates(dedupe(appendProxy(videoId, urls))).slice(0, 16);
  if (ranked.length) {
    const entry = { urls: ranked, expires: Date.now() + CACHE_TTL };
    cache.set(videoId, entry);
    writeDisk(videoId, entry);
  }
  return ranked;
}

function mergeIntoCache(videoId: string, extra: AudioCandidate[]) {
  if (!extra.length) return;
  const prev = cache.get(videoId)?.urls || [];
  finalize(videoId, [...prev, ...extra]);
}

/**
 * Race mirrors + /api/s. Return as soon as the first source answers,
 * then keep enriching the cache in the background for failover.
 */
async function scrapeFresh(videoId: string): Promise<AudioCandidate[]> {
  const collected: AudioCandidate[] = [];
  const push = (got: AudioCandidate[]) => {
    for (const c of got) {
      if (!collected.some((u) => u.url === c.url)) collected.push(c);
    }
  };

  // /api/s first in spirit (reliable) + top mirrors — all raced
  const racers: Promise<AudioCandidate[]>[] = [
    scrapeServerFallback(videoId),
    ...INV.slice(0, 4).map((b) => scrapeInvidious(b, videoId)),
    ...PIPED.map((b) => scrapePiped(b, videoId)),
  ];

  let early: AudioCandidate[] = [];
  try {
    const first = await Promise.any(
      racers.map((p) =>
        p.then((got) => {
          if (!got.length) throw new Error('empty');
          return got;
        })
      )
    );
    push(first);
    early = finalize(videoId, collected);
  } catch {
    // all rejected so far
  }

  // Background: gather more failover URLs without blocking playback
  void (async () => {
    const more = await Promise.allSettled(
      racers.map((p) =>
        Promise.race([
          p,
          new Promise<AudioCandidate[]>((_, rej) => setTimeout(() => rej(new Error('t')), 900)),
        ])
      )
    );
    const extra: AudioCandidate[] = [];
    for (const r of more) {
      if (r.status === 'fulfilled') extra.push(...r.value);
    }
    if (extra.length) mergeIntoCache(videoId, extra);
  })();

  if (early.length) return early;

  // Nothing yet — short wait for remaining, then always include proxy
  const settled = await Promise.race([
    Promise.allSettled(racers),
    new Promise<PromiseSettledResult<AudioCandidate[]>[]>((resolve) =>
      setTimeout(() => resolve([]), 2800)
    ),
  ]);
  for (const r of settled) {
    if (r.status === 'fulfilled') push(r.value);
  }

  const final = finalize(videoId, collected);
  // Even with zero streams, proxy alone can save the play
  if (!final.length) {
    return finalize(videoId, []);
  }
  return final;
}

/**
 * Resolve ranked audio URLs. Dedupes in-flight requests.
 * Memory → sessionStorage → network.
 */
export async function scrapeAudioCandidates(videoId: string): Promise<AudioCandidate[]> {
  if (!videoId) return [];

  const hit = cache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.urls;

  const disk = hydrateFromDisk(videoId);
  if (disk?.length) {
    // Refresh in background
    if (!inflight.has(videoId)) {
      const job = scrapeFresh(videoId).finally(() => inflight.delete(videoId));
      inflight.set(videoId, job);
    }
    return disk;
  }

  const pending = inflight.get(videoId);
  if (pending) return pending;

  const job = scrapeFresh(videoId).finally(() => {
    inflight.delete(videoId);
  });
  inflight.set(videoId, job);
  return job;
}

export function rememberScrapeHit(videoId: string, url: string, meta?: Partial<AudioCandidate>): void {
  const prev = cache.get(videoId)?.urls || [];
  const hit: AudioCandidate = {
    url,
    source: meta?.source || 'verified',
    mime: meta?.mime,
    bitrate: meta?.bitrate,
  };
  const rest = prev.filter((c) => c.url !== url);
  const entry = { urls: [hit, ...rest], expires: Date.now() + CACHE_TTL };
  cache.set(videoId, entry);
  writeDisk(videoId, entry);
}

export function forgetScrape(videoId: string): void {
  cache.delete(videoId);
  try {
    if (typeof sessionStorage === 'undefined') return;
    const all = readDisk();
    delete all[videoId];
    sessionStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function forgetScrapeUrl(videoId: string, url: string): void {
  const hit = cache.get(videoId);
  if (!hit) return;
  const urls = hit.urls.filter((c) => c.url !== url);
  if (!urls.length) {
    forgetScrape(videoId);
    return;
  }
  const entry = { urls, expires: hit.expires };
  cache.set(videoId, entry);
  writeDisk(videoId, entry);
}

export function peekScrapeUrl(videoId: string): string | null {
  let hit = cache.get(videoId);
  if (!hit || hit.expires <= Date.now()) {
    const disk = hydrateFromDisk(videoId);
    if (!disk?.length) return null;
    hit = cache.get(videoId);
  }
  if (!hit) return null;
  const best = hit.urls.find((c) => !isServerAudioProxy(c));
  return best?.url || hit.urls[0]?.url || null;
}

export function peekScrapeCandidates(videoId: string): AudioCandidate[] {
  let hit = cache.get(videoId);
  if (!hit || hit.expires <= Date.now()) {
    hydrateFromDisk(videoId);
    hit = cache.get(videoId);
  }
  if (!hit || hit.expires <= Date.now()) return [];
  return hit.urls;
}

export function warmScrape(videoId: string): void {
  if (!videoId) return;
  if (peekScrapeUrl(videoId)) return;
  void scrapeAudioCandidates(videoId);
}
