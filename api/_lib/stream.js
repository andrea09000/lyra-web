const { INV, fetchJson } = require('./invidious');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PIPED = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
];

/** First head bytes — enough for ftyp/moov/sidx so <audio> starts; keep small for TTFB. */
const CHUNK = 64 * 1024;
/** Subsequent Range responses from /api/audio can be larger. */
const STREAM_CHUNK = 1024 * 1024;

/** videoId -> { url, total, contentType, expires } */
const urlCache = new Map();
/** videoId -> { buf, total, contentType, expires } (first CHUNK, in RAM) */
const headCache = new Map();
/** videoId -> Promise<head> */
const headInflight = new Map();
const HEAD_CACHE_MAX = 48;

function upstreamHeaders(range) {
  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.youtube.com/',
    Origin: 'https://www.youtube.com',
  };
  if (range) headers.Range = range;
  return headers;
}

function looksLikeAudio(buf, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) return false;
  if (ct.includes('audio/')) return true;
  if (buf?.length > 8) {
    if (buf.toString('ascii', 4, 8) === 'ftyp') return true;
    if (buf[0] === 0x1a && buf[1] === 0x45) return true;
    if (buf.toString('ascii', 0, 3) === 'ID3') return true;
  }
  return ct.includes('octet-stream') || ct.includes('video/mp4');
}

function isRawGoogleVideo(url) {
  try {
    return new URL(url).hostname.includes('googlevideo.com');
  } catch {
    return false;
  }
}

/** ytify-style: swap googlevideo origin for the Invidious host. */
function proxiedThroughInstance(rawUrl, instanceBase) {
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

function trimHeadCache() {
  while (headCache.size > HEAD_CACHE_MAX) {
    const first = headCache.keys().next().value;
    headCache.delete(first);
    urlCache.delete(first);
  }
}

function normBitrate(raw) {
  const n = Number(raw || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 2000 ? n * 1000 : n;
}

/** HTML5 <audio> on iOS/Safari only plays AAC/MP4 — never WebM/Opus. */
function isSafariSafeMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m.includes('mp4') || m.includes('m4a') || m.includes('mp4a') || m.includes('aac');
}

function rankAudioFormats(a, b) {
  const aSafe = isSafariSafeMime(a.type || a.mimeType || a.mime) ? 1 : 0;
  const bSafe = isSafariSafeMime(b.type || b.mimeType || b.mime) ? 1 : 0;
  if (aSafe !== bSafe) return bSafe - aSafe;
  return normBitrate(b.bitrate) - normBitrate(a.bitrate);
}

/** Best playable audio from an Invidious instance (AAC first for Safari). */
async function urlFromInvidious(base, videoId) {
  const clean = base.replace(/\/$/, '');
  const data = await fetchJson(`${clean}/api/v1/videos/${videoId}`, 2500);
  if (data.error) throw new Error(data.error);
  const formats = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])];
  const audio = formats
    .filter((f) => f.url && typeof f.type === 'string' && f.type.startsWith('audio/'))
    .sort(rankAudioFormats);
  const best = audio[0];
  if (!best?.url) throw new Error('no audio');
  const absolute = best.url.startsWith('http') ? best.url : `${clean}${best.url}`;
  const proxied = proxiedThroughInstance(absolute, clean);
  return {
    url: proxied || absolute,
    bitrate: normBitrate(best.bitrate),
    mime: best.type || 'audio/mp4',
  };
}

async function urlFromPiped(base, videoId) {
  const clean = base.replace(/\/$/, '');
  const data = await fetchJson(`${clean}/streams/${videoId}`, 2500);
  const streams = (data.audioStreams || [])
    .filter((s) => s.url)
    .sort((a, b) =>
      rankAudioFormats(
        { type: a.mimeType, bitrate: a.bitrate },
        { type: b.mimeType, bitrate: b.bitrate }
      )
    );
  if (!streams[0]?.url) throw new Error('no piped');
  return {
    url: streams[0].url,
    bitrate: normBitrate(streams[0].bitrate),
    mime: streams[0].mimeType || 'audio/mp4',
  };
}

function isOpusMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m.includes('webm') || m.includes('opus');
}

/** Chrome/Firefox/Edge (incl. Android): Opus like ytify. Safari/iOS: AAC only. */
function clientPrefersOpus(req) {
  const ua = String(req?.headers?.['user-agent'] || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(ua)) return false;
  return /Chrome|Chromium|Firefox|Edg|OPR|Android/i.test(ua);
}

function rankPlayableItems(a, b, preferOpus = false) {
  if (preferOpus) {
    // ytify desktop: Opus first (smaller → faster start on PC)
    const aOpus = isOpusMime(a.mime) ? 1 : 0;
    const bOpus = isOpusMime(b.mime) ? 1 : 0;
    if (aOpus !== bOpus) return bOpus - aOpus;
  } else {
    const aSafe = isSafariSafeMime(a.mime) ? 1 : 0;
    const bSafe = isSafariSafeMime(b.mime) ? 1 : 0;
    if (aSafe !== bSafe) return bSafe - aSafe;
  }
  // Prefer raw googlevideo for browser <audio> (ytify proxyHandler default)
  const aRaw = isRawGoogleVideo(a.url) ? 1 : 0;
  const bRaw = isRawGoogleVideo(b.url) ? 1 : 0;
  if (aRaw !== bRaw) return bRaw - aRaw;
  return (b.bitrate || 0) - (a.bitrate || 0);
}

/** Collect ranked stream candidates (objects). RapidAPI/Innertube first — public Inv is mostly dead. */
async function collectCandidates(videoId) {
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (!item?.url || String(item.url).includes('/api/audio/') || seen.has(item.url)) return;
    seen.add(item.url);
    items.push(item);
  };

  // 1) RapidAPI / mirrors (ytify path) — keep youtubei off the hot path
  try {
    const { resolveInnertube } = require('./innertube');
    const data = await Promise.race([
      resolveInnertube(videoId, { fast: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('innertube-timeout')), 4000)),
    ]);
    for (const f of data.adaptiveFormats || []) {
      if (!f.url) continue;
      const raw = String(f.url);
      if (raw.includes('/api/audio/')) continue;
      // Prefer raw googlevideo for server-side getHead (Vercel can fetch it);
      // also keep inv-proxied copies for browser-direct when mirrors work.
      push({
        url: raw,
        bitrate: normBitrate(f.bitrate),
        mime: f.type || 'audio/mp4',
      });
      if (isRawGoogleVideo(raw)) {
        for (const invBase of INV.slice(0, 2)) {
          const proxied = proxiedThroughInstance(raw, invBase);
          if (proxied) {
            push({
              url: proxied,
              bitrate: normBitrate(f.bitrate),
              mime: f.type || 'audio/mp4',
            });
          }
        }
      }
    }
  } catch {
    // fall through
  }

  // 2) Best-effort public mirrors (often down — short timeouts)
  const jobs = [
    ...INV.slice(0, 3).map((b) => urlFromInvidious(b, videoId)),
    ...PIPED.map((b) => urlFromPiped(b, videoId)),
  ];
  const settled = await Promise.allSettled(
    jobs.map((p) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 2500))])
    )
  );
  for (const s of settled) {
    if (s.status === 'fulfilled') push(s.value);
  }

  items.sort(rankPlayableItems);
  return items;
}

async function candidateUrls(videoId) {
  const items = await collectCandidates(videoId);
  const urls = items.map((i) => i.url);
  if (!urls.length) throw new Error('Nessuno stream disponibile');
  return urls;
}

/**
 * Best URL for <audio> in the browser — fail-fast.
 * Today public Inv/Piped rarely return URLs (SABR). RapidAPI often does.
 * Raw googlevideo → browser uses /api/audio; we still report mime/bitrate.
 */
async function resolvePlayable(videoId) {
  // RapidAPI first (ytify)
  try {
    const { resolveInnertube } = require('./innertube');
    const data = await Promise.race([
      resolveInnertube(videoId, { fast: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('playable-timeout')), 2500)),
    ]);
    const formats = (data.adaptiveFormats || [])
      .filter((f) => f.url && !String(f.url).includes('/api/audio/'))
      .sort((a, b) =>
        rankPlayableItems(
          { url: a.url, mime: a.type, bitrate: normBitrate(a.bitrate) },
          { url: b.url, mime: b.type, bitrate: normBitrate(b.bitrate) }
        )
      );
    const best = formats[0];
    if (best?.url) {
      // HTML5 <audio> can play googlevideo DIRECTLY (media element ≠ fetch CORS).
      // Proxying via Vercel often 403s — browser IP works. ytify does the same.
      return {
        url: best.url,
        mime: best.type || 'audio/mp4',
        bitrate: normBitrate(best.bitrate),
        mode: isRawGoogleVideo(best.url) ? 'direct-yt' : 'direct',
      };
    }
  } catch {
    // fall through
  }

  void getHead(videoId).catch(() => undefined);
  return {
    url: null,
    mime: 'audio/mp4',
    bitrate: 0,
    mode: 'proxy',
  };
}

/**
 * Resolve a playable googlevideo/mirror URL WITHOUT downloading audio bytes.
 * Used by /api/go 302 — browser streams straight from the CDN (fastest start).
 * @param {string} videoId
 * @param {{ preferOpus?: boolean }} [opts]
 */
function pickBestFormat(formats, preferOpus) {
  const ranked = (formats || [])
    .filter((f) => f.url && !String(f.url).includes('/api/audio/'))
    .sort((a, b) =>
      rankPlayableItems(
        { url: a.url, mime: a.type, bitrate: normBitrate(a.bitrate) },
        { url: b.url, mime: b.type, bitrate: normBitrate(b.bitrate) },
        preferOpus
      )
    );
  return ranked[0] || null;
}

async function resolveDirectAudioUrl(videoId, opts = {}) {
  const preferOpus = opts.preferOpus === true;
  const cacheKey = preferOpus ? `${videoId}:opus` : `${videoId}:aac`;

  const keyed = urlCache.get(cacheKey);
  if (keyed && keyed.expires > Date.now()) {
    return { url: keyed.url, contentType: keyed.contentType || 'audio/mp4', total: keyed.total || 0 };
  }

  if (!preferOpus) {
    const headHit = headCache.get(videoId);
    if (headHit && headHit.expires > Date.now()) {
      return { url: headHit.url, contentType: headHit.contentType || 'audio/mp4', total: headHit.total || 0 };
    }
  }

  const { resolveInnertube } = require('./innertube');
  let best = null;
  try {
    const data = await Promise.race([
      resolveInnertube(videoId, { fast: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('resolve-timeout')), 4500)),
    ]);
    best = pickBestFormat(data.adaptiveFormats, preferOpus);
  } catch {
    // escalate below
  }

  // Hard tracks (age/cipher/region): full youtubei + Inv
  if (!best?.url) {
    try {
      const data = await Promise.race([
        resolveInnertube(videoId, { fast: false }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('resolve-slow-timeout')), 9000)),
      ]);
      best = pickBestFormat(data.adaptiveFormats, preferOpus);
    } catch {
      // fall through
    }
  }

  if (!best?.url) throw new Error('no audio url');

  const contentType = best.type || 'audio/mp4';
  const clen = Number(best.clen || 0);
  const entry = {
    url: String(best.url),
    total: Number.isFinite(clen) && clen > 0 ? clen : 0,
    contentType,
    expires: Date.now() + 12 * 60 * 1000,
  };
  urlCache.set(cacheKey, entry);
  // Also seed generic key for getHead reuse
  urlCache.set(videoId, entry);
  return { url: entry.url, contentType, total: entry.total };
}

/**
 * First CHUNK of audio, cached in RAM.
 * Requires a trustworthy Content-Range total (or a complete 200 body).
 */
async function getHead(videoId) {
  const hit = headCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit;

  const pending = headInflight.get(videoId);
  if (pending) return pending;

  const job = (async () => {
    // Prefer URL already resolved by /api/go or /api/play
    let urls = [];
    const urlHit = urlCache.get(videoId);
    if (urlHit && urlHit.expires > Date.now()) urls = [urlHit.url];

    if (!urls.length) {
      const { resolveInnertube } = require('./innertube');
      for (const fast of [true, false]) {
        try {
          const data = await Promise.race([
            resolveInnertube(videoId, { fast }),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('t')), fast ? 4500 : 9000)
            ),
          ]);
          urls = (data.adaptiveFormats || [])
            .filter((f) => f.url && !String(f.url).includes('/api/audio/'))
            .sort((a, b) =>
              rankPlayableItems(
                { url: a.url, mime: a.type, bitrate: normBitrate(a.bitrate) },
                { url: b.url, mime: b.type, bitrate: normBitrate(b.bitrate) }
              )
            )
            .map((f) => String(f.url));
          if (urls.length) break;
        } catch {
          // try next
        }
      }
    }
    if (!urls.length) {
      try {
        urls = await candidateUrls(videoId);
      } catch {
        urls = [];
      }
    }
    // Prefer Inv-rewritten mirrors for server fetch (raw GV often 403 from Vercel IP)
    if (urls.length) {
      const proxied = [];
      const raw = [];
      for (const u of urls) {
        if (isRawGoogleVideo(u)) {
          raw.push(u);
          for (const invBase of INV.slice(0, 3)) {
            const p = proxiedThroughInstance(u, invBase);
            if (p) proxied.push(p);
          }
        } else {
          proxied.push(u);
        }
      }
      urls = [...proxied, ...raw];
    }

    let lastError;

    for (const url of urls.slice(0, 6)) {
      try {
        const res = await fetch(url, {
          headers: upstreamHeaders(`bytes=0-${CHUNK - 1}`),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok && res.status !== 206) {
          lastError = new Error(`upstream ${res.status}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || 'audio/mp4';
        if (!looksLikeAudio(buf, contentType)) {
          lastError = new Error('not audio');
          continue;
        }

        let total = 0;
        const cr = res.headers.get('content-range');
        const m = cr && /\/(\d+)/.exec(cr);
        if (m) {
          total = Number(m[1]);
        } else if (res.status === 200) {
          const cl = Number(res.headers.get('content-length') || 0);
          if (cl > 0 && buf.length >= cl) total = cl;
          else if (buf.length > CHUNK) total = buf.length;
          else {
            lastError = new Error('no content-range');
            continue;
          }
        } else {
          lastError = new Error('206 without content-range');
          continue;
        }

        if (!Number.isFinite(total) || total < 1024) {
          lastError = new Error('bad total');
          continue;
        }

        const entry = { url, buf, total, contentType, expires: Date.now() + 20 * 60 * 1000 };
        headCache.set(videoId, entry);
        urlCache.set(videoId, {
          url,
          total,
          contentType,
          expires: Date.now() + 20 * 60 * 1000,
        });
        trimHeadCache();
        return entry;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Nessuno stream');
  })();

  headInflight.set(videoId, job);
  try {
    return await job;
  } finally {
    headInflight.delete(videoId);
  }
}

async function resolveStream(videoId) {
  const hit = urlCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit;
  const head = await getHead(videoId);
  return { url: head.url, total: head.total, contentType: head.contentType };
}

function parseRange(header, total) {
  const maxEnd = Math.max(0, total - 1);
  if (!header) {
    // No Range: still serve first chunk as 206 with correct total (Safari will continue)
    return { start: 0, end: Math.min(maxEnd, CHUNK - 1) };
  }
  const m = /bytes=(\d+)-(\d*)/.exec(header);
  if (!m) return { start: 0, end: Math.min(maxEnd, CHUNK - 1) };
  const start = Math.min(Number(m[1]), maxEnd);
  let end = m[2] !== '' && m[2] !== undefined ? Number(m[2]) : maxEnd;
  end = Math.min(end, maxEnd);
  const cap = start === 0 ? CHUNK : STREAM_CHUNK;
  if (end - start + 1 > cap) end = start + cap - 1;
  return { start, end };
}

function dropCaches(videoId) {
  if (!videoId) return;
  urlCache.delete(videoId);
  urlCache.delete(`${videoId}:opus`);
  urlCache.delete(`${videoId}:aac`);
  headCache.delete(videoId);
  headInflight.delete(videoId);
  try {
    const { dropInnertubeCache } = require('./innertube');
    dropInnertubeCache(videoId);
  } catch {
    // optional
  }
}

module.exports = {
  CHUNK,
  getHead,
  resolveDirectAudioUrl,
  clientPrefersOpus,
  resolveStream,
  resolvePlayable,
  collectCandidates,
  parseRange,
  upstreamHeaders,
  dropCaches,
  isSafariSafeMime,
  isRawGoogleVideo,
};
