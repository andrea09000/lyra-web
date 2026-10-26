/**
 * YouTube audio scrape — ytify-style: browser → Invidious (user IP),
 * rewrite googlevideo → inv-proxy host (raw googlevideo often 403).
 */

export type AudioCandidate = {
  url: string;
  source: string;
  mime?: string;
  bitrate?: number;
};

/** Same instance pool as ytify getStreamData — browser → Inv (user IP). */
const INV = [
  'https://yt.omada.cafe',
  'https://invidious.schenkel.eti.br',
  'https://invidious.kemonomimi.nl',
  'https://echostreamz.com',
];

const PIPED = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
];

const cache = new Map<string, { urls: AudioCandidate[]; expires: number }>();
const inflight = new Map<string, Promise<AudioCandidate[]>>();
/** Stream URLs are IP/time-bound — keep cache short */
const CACHE_TTL = 12 * 60 * 1000;
/** v6: ytify instance list + raw googlevideo for Chrome (like proxyHandler) */
const LS_KEY = 'vybe-scrape-cache-v6';
const STICKY_KEY = 'vybe-sticky-inv';
let stickyInv: string | null = null;

function readSticky(): string | null {
  if (stickyInv) return stickyInv;
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const v = sessionStorage.getItem(STICKY_KEY);
    if (v && INV.includes(v)) {
      stickyInv = v;
      return v;
    }
  } catch {
    // ignore
  }
  return null;
}

function rememberSticky(source: string) {
  if (!source.startsWith('inv-proxy:') && !source.startsWith('inv:')) return;
  const host = source.split(':')[1];
  if (!host) return;
  const base = INV.find((b) => b.includes(host));
  if (!base) return;
  stickyInv = base;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STICKY_KEY, base);
  } catch {
    // ignore
  }
}

function orderedInv(): string[] {
  const sticky = readSticky();
  if (!sticky) return INV.slice();
  return [sticky, ...INV.filter((b) => b !== sticky)];
}

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

async function fetchJson(url: string, ms = 2500): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function normalizeBitrate(raw?: number | string): number {
  const n = Number(raw || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 2000 ? n * 1000 : n;
}

function isSafariSafeMime(mime?: string): boolean {
  const m = String(mime || '').toLowerCase();
  return m.includes('mp4') || m.includes('m4a') || m.includes('mp4a') || m.includes('aac');
}

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

function allowsRawGoogleVideo(): boolean {
  // ytify: Chrome/Firefox play raw googlevideo; Safari/iOS often 403 → inv-proxy
  if (typeof navigator === 'undefined') return false;
  if (browserNeedsMp4()) return false;
  return /Chrome|Chromium|Firefox|Edg|OPR|Android/i.test(navigator.userAgent);
}

function qualityScore(c: AudioCandidate): number {
  const br = normalizeBitrate(c.bitrate);
  const safe = isSafariSafeMime(c.mime);
  const needsMp4 = browserNeedsMp4();
  const opus = /webm|opus/i.test(String(c.mime || ''));
  // ytify desktop: Opus first; Safari: AAC
  const codecBoost = needsMp4 ? (safe ? 1_000_000 : 0) : opus ? 1_000_000 : safe ? 100_000 : 0;
  // Music app = ytify Topic path: Inv-proxy first (raw GV often 403 on mobile nets)
  const invBoost =
    c.source.includes('inv-proxy') || c.source.startsWith('api-inv:')
      ? 900_000
      : allowsRawGoogleVideo() && c.source.includes('raw')
        ? 300_000
        : c.source.startsWith('fallback:')
          ? 500_000
          : 0;
  return br + codecBoost + invBoost;
}

function isServerAudioProxy(c: AudioCandidate): boolean {
  return c.source === 'proxy:audio' || c.url.includes('/api/audio/');
}

function sortCandidates(list: AudioCandidate[]): AudioCandidate[] {
  return [...list].sort((a, b) => {
    const aLast = isServerAudioProxy(a) ? 1 : 0;
    const bLast = isServerAudioProxy(b) ? 1 : 0;
    if (aLast !== bLast) return aLast - bLast;
    return qualityScore(b) - qualityScore(a);
  });
}

/** ytify proxyHandler: swap googlevideo origin for the Invidious host. */
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
  const data = (await fetchJson(`${clean}/api/v1/videos/${videoId}`, 2800)) as {
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

  const allowRaw = allowsRawGoogleVideo();
  for (const f of formats) {
    let raw = String(f.url);
    if (!raw.startsWith('http')) raw = `${clean}${raw}`;
    const br = normalizeBitrate(f.bitrate) || undefined;

    // ytify proxyHandler: raw googlevideo for Chrome; inv-proxy for Topic/Safari
    if (allowRaw && (raw.includes('googlevideo.com') || raw.includes('videoplayback'))) {
      out.push({
        url: raw,
        source: `inv-raw:${host}`,
        mime: f.type,
        bitrate: br,
      });
    }
    const proxied = proxiedThroughInstance(raw, clean);
    if (proxied) {
      out.push({
        url: proxied,
        source: `inv-proxy:${host}`,
        mime: f.type,
        bitrate: br,
      });
    }
  }
  if (!out.length) throw new Error('no audio');
  return out;
}

async function scrapePiped(base: string, videoId: string): Promise<AudioCandidate[]> {
  const clean = base.replace(/\/$/, '');
  const data = (await fetchJson(`${clean}/streams/${videoId}`, 3000)) as {
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

async function scrapeSameOriginInv(videoId: string): Promise<AudioCandidate[]> {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  if (!origin) return [];
  const res = await fetch(`${origin}/api/inv/${encodeURIComponent(videoId)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`api/inv ${res.status}`);
  const data = (await res.json()) as {
    adaptiveFormats?: { url?: string; type?: string; bitrate?: string }[];
    source?: string;
  };
  const formats = [...(data.adaptiveFormats || [])]
    .filter((f) => f.url && !f.url.includes('/api/audio/') && !f.url.includes('googlevideo.com'))
    .sort((a, b) => {
      const aSafe = isSafariSafeMime(a.type) ? 1 : 0;
      const bSafe = isSafariSafeMime(b.type) ? 1 : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;
      return normalizeBitrate(b.bitrate) - normalizeBitrate(a.bitrate);
    });
  return formats.map((f) => ({
    url: f.url!,
    source: `api-inv:${data.source || 'inv'}`,
    mime: f.type,
    bitrate: normalizeBitrate(f.bitrate) || undefined,
  }));
}

async function scrapeServerFallback(videoId: string): Promise<AudioCandidate[]> {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  if (!origin) return [];
  const res = await fetch(`${origin}/api/s/${encodeURIComponent(videoId)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
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
  const allowRaw = allowsRawGoogleVideo();
  for (const f of formats) {
    const url = f.url!;
    // RapidAPI often adds &fallback — Chrome plays raw googlevideo (ytify)
    if (url.includes('googlevideo.com') && !allowRaw) continue;
    out.push({
      url,
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
  const ranked = sortCandidates(dedupe(appendProxy(videoId, urls))).slice(0, 16);
  if (ranked.length) {
    const entry = { urls: ranked, expires: Date.now() + CACHE_TTL };
    cache.set(videoId, entry);
    writeDisk(videoId, entry);
  }
  return ranked;
}

/**
 * ytify getStreamData: sticky Inv → remaining Inv → same-origin Inv → /api/s → Piped.
 */
async function raceSources(videoId: string): Promise<AudioCandidate[]> {
  const order = orderedInv();

  // 1) Sticky / first instance
  if (order[0]) {
    try {
      const urls = await Promise.race([
        scrapeInvidious(order[0], videoId),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('sticky-timeout')), 3200)
        ),
      ]);
      if (urls[0]?.source) rememberSticky(urls[0].source);
      return urls;
    } catch {
      // fall through
    }
  }

  // 2) Remaining mirrors one-by-one (ytify)
  for (const base of order.slice(1)) {
    try {
      const urls = await scrapeInvidious(base, videoId);
      if (urls[0]?.source) rememberSticky(urls[0].source);
      return urls;
    } catch {
      // next
    }
  }

  // 3) Same-origin Inv bridge (CORS-safe)
  try {
    const viaApi = await scrapeSameOriginInv(videoId);
    if (viaApi.length) return viaApi;
  } catch {
    // fall through
  }

  // 4) Emergency: /api/s (ytify local edge /s/) — await, don't background
  try {
    const fromServer = await scrapeServerFallback(videoId);
    if (fromServer.length) return fromServer;
  } catch {
    // fall through
  }

  // 5) Piped mirrors
  for (const base of PIPED) {
    try {
      const urls = await scrapePiped(base, videoId);
      if (urls.length) return urls;
    } catch {
      // next
    }
  }

  return [];
}

async function scrapeFresh(videoId: string): Promise<AudioCandidate[]> {
  try {
    let urls: AudioCandidate[];
    try {
      urls = await raceSources(videoId);
    } catch {
      await new Promise((r) => setTimeout(r, 120));
      urls = await raceSources(videoId);
    }
    return finalize(videoId, urls);
  } catch {
    return finalize(videoId, []);
  }
}

export function peekScrapeCandidates(videoId: string): AudioCandidate[] {
  const hit = cache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.urls;
  return hydrateFromDisk(videoId) || [];
}

export function peekScrapeUrl(videoId: string): string | null {
  const list = peekScrapeCandidates(videoId);
  const best = list.find((c) => !isServerAudioProxy(c));
  return best?.url || null;
}

export function forgetScrape(videoId: string) {
  cache.delete(videoId);
  inflight.delete(videoId);
  try {
    if (typeof sessionStorage === 'undefined') return;
    const all = readDisk();
    delete all[videoId];
    sessionStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function forgetScrapeUrl(videoId: string, url: string) {
  const hit = cache.get(videoId);
  if (!hit) return;
  hit.urls = hit.urls.filter((c) => c.url !== url);
  if (!hit.urls.length) cache.delete(videoId);
}

export function rememberScrapeHit(videoId: string, url: string) {
  const prev = peekScrapeCandidates(videoId);
  const hit = prev.find((c) => c.url === url);
  if (hit) {
    finalize(videoId, [{ ...hit, source: 'verified' }, ...prev]);
    if (hit.source) rememberSticky(hit.source);
  }
}

export async function scrapeAudioCandidates(videoId: string): Promise<AudioCandidate[]> {
  if (!videoId) return [];
  const cached = peekScrapeCandidates(videoId);
  if (cached.some((c) => !isServerAudioProxy(c))) return cached;

  const pending = inflight.get(videoId);
  if (pending) return pending;

  const job = scrapeFresh(videoId).finally(() => inflight.delete(videoId));
  inflight.set(videoId, job);
  return job;
}

export function warmScrape(videoId: string): void {
  if (!videoId) return;
  if (peekScrapeCandidates(videoId).some((c) => !isServerAudioProxy(c))) return;
  if (inflight.has(videoId)) return;
  void scrapeAudioCandidates(videoId);
}
