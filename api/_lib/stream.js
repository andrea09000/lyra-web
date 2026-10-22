const { INV, fetchJson } = require('./invidious');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PIPED = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
];

/** Bytes per response — larger init helps Safari start fragmented YouTube AAC. */
const CHUNK = 1024 * 1024;

/** videoId -> { url, total, contentType, expires } */
const urlCache = new Map();
/** videoId -> { buf, total, contentType, expires } (first CHUNK, in RAM) */
const headCache = new Map();
const HEAD_CACHE_MAX = 40;

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

function rankPlayableItems(a, b) {
  // 1) Safari-safe AAC/MP4
  const aSafe = isSafariSafeMime(a.mime) ? 1 : 0;
  const bSafe = isSafariSafeMime(b.mime) ? 1 : 0;
  if (aSafe !== bSafe) return bSafe - aSafe;
  // 2) Browser-direct (inv-proxy / piped) over raw googlevideo
  const aRaw = isRawGoogleVideo(a.url) ? 1 : 0;
  const bRaw = isRawGoogleVideo(b.url) ? 1 : 0;
  if (aRaw !== bRaw) return aRaw - bRaw;
  // 3) Bitrate
  return (b.bitrate || 0) - (a.bitrate || 0);
}

/** Collect ranked stream candidates (objects). */
async function collectCandidates(videoId) {
  const jobs = [
    ...INV.map((b) => urlFromInvidious(b, videoId)),
    ...PIPED.map((b) => urlFromPiped(b, videoId)),
  ];
  const settled = await Promise.allSettled(jobs);
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (!item?.url || String(item.url).includes('/api/audio/') || seen.has(item.url)) return;
    seen.add(item.url);
    items.push(item);
  };
  for (const s of settled) {
    if (s.status === 'fulfilled') push(s.value);
  }

  // Always merge InnerTube — rewrite googlevideo via Invidious so the phone can play direct
  try {
    const { resolveInnertube } = require('./innertube');
    const data = await resolveInnertube(videoId);
    for (const invBase of INV.slice(0, 3)) {
      for (const f of data.adaptiveFormats || []) {
        if (!f.url) continue;
        const raw = String(f.url);
        if (raw.includes('/api/audio/')) continue;
        const proxied = isRawGoogleVideo(raw) ? proxiedThroughInstance(raw, invBase) : null;
        push({
          url: proxied || raw,
          bitrate: normBitrate(f.bitrate),
          mime: f.type || 'audio/mp4',
        });
      }
    }
  } catch {
    // ignore
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
 * Prefer Invidious-proxied AAC (direct play, no Vercel hop). Raw YT → use /api/audio.
 */
async function resolvePlayable(videoId) {
  const jobs = [
    ...INV.map((b) => urlFromInvidious(b, videoId)),
    ...PIPED.map((b) => urlFromPiped(b, videoId)),
  ];

  // First Safari-safe non-raw wins — hard cap so /api/play never hangs the client
  try {
    const winner = await Promise.race([
      Promise.any(
        jobs.map((p) =>
          p.then((item) => {
            if (!item?.url) throw new Error('empty');
            if (!isSafariSafeMime(item.mime)) throw new Error('not aac');
            if (isRawGoogleVideo(item.url)) throw new Error('raw');
            return item;
          })
        )
      ),
      new Promise((_, rej) => setTimeout(() => rej(new Error('playable-timeout')), 4500)),
    ]);
    return {
      url: winner.url,
      mime: winner.mime || 'audio/mp4',
      bitrate: winner.bitrate || 0,
      mode: 'direct',
    };
  } catch {
    // fall through to proxy
  }

  // Slower path: full collect + InnerTube rewrite
  const items = await collectCandidates(videoId);
  if (!items.length) throw new Error('Nessuno stream disponibile');

  const direct = items.find((i) => isSafariSafeMime(i.mime) && !isRawGoogleVideo(i.url));
  if (direct) {
    return {
      url: direct.url,
      mime: direct.mime || 'audio/mp4',
      bitrate: direct.bitrate || 0,
      mode: 'direct',
    };
  }

  const anySafe = items.find((i) => isSafariSafeMime(i.mime)) || items[0];
  void getHead(videoId).catch(() => undefined);
  return {
    url: null,
    mime: anySafe?.mime || 'audio/mp4',
    bitrate: anySafe?.bitrate || 0,
    mode: 'proxy',
  };
}

/**
 * First CHUNK of audio, cached in RAM.
 * Requires a trustworthy Content-Range total (or a complete 200 body).
 */
async function getHead(videoId) {
  const hit = headCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit;

  const urls = await candidateUrls(videoId);
  let lastError;

  for (const url of urls.slice(0, 5)) {
    try {
      const res = await fetch(url, {
        headers: upstreamHeaders(`bytes=0-${CHUNK - 1}`),
        signal: AbortSignal.timeout(12000),
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
        // Full file returned without Range support
        if (cl > 0 && buf.length >= cl) total = cl;
        else if (buf.length > CHUNK) total = buf.length;
        else {
          // Short 200 with no Content-Range — don't poison total as CHUNK size
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
  if (end - start + 1 > CHUNK) end = start + CHUNK - 1;
  return { start, end };
}

function dropCaches(videoId) {
  urlCache.delete(videoId);
  headCache.delete(videoId);
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
  resolveStream,
  resolvePlayable,
  collectCandidates,
  parseRange,
  upstreamHeaders,
  dropCaches,
  isSafariSafeMime,
  isRawGoogleVideo,
};
