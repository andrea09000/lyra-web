/**
 * Lyra Web — YouTube scrape proxy (InnerTube via youtubei.js).
 * Browser cannot call YouTube directly (CORS); this Node process does.
 *
 * Endpoints:
 *   GET /api/health
 *   GET /api/search?q=&limit=
 *   GET /api/artists?q=&limit=
 *   GET /api/trending?limit=
 *   GET /api/videos?ids=id1,id2
 *   GET /api/related/:id?limit=
 *   GET /api/stream/:id
 */
import cors from 'cors';
import express from 'express';
import { Readable } from 'node:stream';
import { Innertube } from 'youtubei.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PORT = Number(process.env.SCRAPE_PORT || 8791);

const INV_SEEDS = [
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.jing.rocks',
  'https://iv.ggtyler.dev',
];
const PIPED_SEEDS = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.syncpundit.io',
];

/** Prefetch this many leading bytes so tap-to-sound skips googlevideo RTT. */
const HEAD_BYTES = 512 * 1024;

let ytPromise = null;
const streamCache = new Map();
/** @type {Map<string, { url: string, buf: Buffer, contentType: string, total: number, expires: number }>} */
const headCache = new Map();
const headInflight = new Map();

function getYt() {
  if (!ytPromise) {
    ytPromise = Innertube.create({
      lang: 'it',
      location: 'IT',
      retrieve_player: false,
    }).catch((err) => {
      ytPromise = null;
      throw err;
    });
  }
  return ytPromise;
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/official\s*audio/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ytThumb(id) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

function pickThumb(item, videoId) {
  const fromArr =
    item?.thumbnails?.[0]?.url ||
    item?.thumbnail?.contents?.[0]?.url ||
    item?.thumbnail?.[0]?.url;
  if (fromArr) return fromArr;
  return videoId ? ytThumb(videoId) : '';
}

function artistFromItem(item) {
  if (Array.isArray(item?.artists) && item.artists[0]?.name) {
    return item.artists.map((a) => a.name).filter(Boolean).join(', ');
  }
  if (item?.author?.name) return item.author.name;
  if (item?.authors?.[0]?.name) return item.authors.map((a) => a.name).join(', ');
  // MusicResponsiveListItem often puts artist in flex_columns[1]
  const col = item?.flex_columns?.[1]?.title?.text;
  if (col) return String(col).split('•')[0].trim();
  return 'YouTube';
}

function videoIdFromItem(item) {
  if (item?.id && String(item.id).length === 11) return item.id;
  const payload =
    item?.flex_columns?.[0]?.title?.runs?.[0]?.endpoint?.payload ||
    item?.overlay?.content?.endpoint?.payload ||
    item?.endpoint?.payload;
  return payload?.videoId || item?.video_id || null;
}

function mapSongItem(item) {
  const id = videoIdFromItem(item);
  const title =
    item?.title?.text ||
    item?.title ||
    item?.flex_columns?.[0]?.title?.text ||
    '';
  if (!id || !title) return null;
  const duration =
    item?.duration?.seconds ||
    item?.length_seconds ||
    item?.duration?.seconds_total ||
    0;
  return {
    id,
    title: cleanTitle(title),
    artist: artistFromItem(item),
    thumbnail: pickThumb(item, id),
    duration: Number(duration) || 0,
  };
}

function musicQuery(q) {
  const t = q.trim();
  if (/\b(music|song|audio|official|mix|lyrics|track|musica|canzone)\b/i.test(t)) return t;
  return `${t} music`;
}

async function fetchJson(url, timeoutMs = 1400) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function streamFromInvidious(base, videoId) {
  const clean = base.replace(/\/$/, '');
  const data = await fetchJson(`${clean}/api/v1/videos/${videoId}`, 1400);
  if (data.error) throw new Error(data.error);
  const formats = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])];
  const audio = formats
    .filter((f) => f.url && typeof f.type === 'string' && f.type.startsWith('audio/'))
    .sort((a, b) => {
      const aMp4 = a.type?.includes('mp4') || a.container === 'm4a' ? 1 : 0;
      const bMp4 = b.type?.includes('mp4') || b.container === 'm4a' ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    });
  const url = audio[0]?.url;
  if (!url) throw new Error('no audio');
  return url.startsWith('http') ? url : `${clean}${url}`;
}

async function streamFromPiped(base, videoId) {
  const clean = base.replace(/\/$/, '');
  const data = await fetchJson(`${clean}/streams/${videoId}`, 1400);
  const streams = (data.audioStreams || [])
    .filter((s) => s.url)
    .sort((a, b) => {
      const aMp4 = a.mimeType?.includes('mp4') ? 1 : 0;
      const bMp4 = b.mimeType?.includes('mp4') ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
  if (!streams[0]?.url) throw new Error('no piped audio');
  return streams[0].url;
}

function looksLikeAudio(buf, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) return false;
  if (ct.includes('audio/')) return true;
  if (buf?.length > 8) {
    if (buf.toString('ascii', 4, 8) === 'ftyp') return true; // mp4/m4a
    if (buf[0] === 0x1a && buf[1] === 0x45) return true; // webm
    if (buf.toString('ascii', 0, 3) === 'ID3') return true;
  }
  return ct.includes('octet-stream') || ct.includes('video/mp4');
}

/** Resolve + prove the URL actually returns audio from this machine. */
async function verifyStreamUrl(url) {
  const res = await fetch(url, {
    headers: upstreamHeaders('bytes=0-2047'),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok && res.status !== 206) throw new Error(`verify ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!looksLikeAudio(buf, res.headers.get('content-type'))) {
    throw new Error('verify not audio');
  }
  return url;
}

async function resolveStream(videoId) {
  const hit = streamCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.url;

  const tasks = [
    ...INV_SEEDS.map((b) => streamFromInvidious(b, videoId).then(verifyStreamUrl)),
    ...PIPED_SEEDS.map((b) => streamFromPiped(b, videoId).then(verifyStreamUrl)),
  ];
  try {
    const url = await Promise.any(tasks);
    streamCache.set(videoId, { url, expires: Date.now() + 25 * 60 * 1000 });
    return url;
  } catch (err) {
    throw err ?? new Error('Nessuno stream');
  }
}

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

/** Download leading bytes into RAM — makes the next /api/audio hit near-instant. */
async function warmHead(videoId) {
  const cached = headCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached;

  const existing = headInflight.get(videoId);
  if (existing) return existing;

  const job = (async () => {
    let url = await resolveStream(videoId);
    let res = await fetch(url, {
      headers: upstreamHeaders(`bytes=0-${HEAD_BYTES - 1}`),
    });
    if (res.status === 403 || res.status === 410) {
      streamCache.delete(videoId);
      headCache.delete(videoId);
      url = await resolveStream(videoId);
      res = await fetch(url, {
        headers: upstreamHeaders(`bytes=0-${HEAD_BYTES - 1}`),
      });
    }
    if (!res.ok && res.status !== 206) {
      streamCache.delete(videoId);
      throw new Error(`warm ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'audio/mp4';
    if (!looksLikeAudio(buf, contentType)) {
      streamCache.delete(videoId);
      throw new Error('warm not audio');
    }
    let total = buf.length;
    const cr = res.headers.get('content-range');
    if (cr) {
      const m = /\/(\d+)/.exec(cr);
      if (m) total = Number(m[1]);
    }
    const entry = {
      url,
      buf,
      contentType,
      total,
      expires: Date.now() + 20 * 60 * 1000,
    };
    headCache.set(videoId, entry);
    return entry;
  })().finally(() => headInflight.delete(videoId));

  headInflight.set(videoId, job);
  return job;
}

function parseRange(header, total) {
  if (!header || total <= 0) return { start: 0, end: Math.max(0, total - 1) };
  const m = /bytes=(\d+)-(\d*)/.exec(header);
  if (!m) return { start: 0, end: total - 1 };
  const start = Number(m[1]);
  const end = m[2] !== undefined && m[2] !== '' ? Number(m[2]) : total - 1;
  return {
    start: Math.min(Math.max(0, start), total - 1),
    end: Math.min(Math.max(0, end), total - 1),
  };
}

const app = express();
app.use(
  cors({
    origin: true,
    methods: ['GET', 'OPTIONS'],
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, engine: 'youtubei.js', port: PORT });
});

app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 40);
    if (!q) return res.json({ tracks: [] });

    const yt = await getYt();
    let tracks = [];

    // Prefer YouTube Music song search (cleaner results for a music app)
    try {
      const music = await yt.music.search(q, { type: 'song' });
      const songs = music.songs?.contents || [];
      tracks = songs.map(mapSongItem).filter(Boolean);
    } catch {
      // fall through
    }

    if (tracks.length < 6) {
      const classic = await yt.search(musicQuery(q), { type: 'video' });
      const videos = (classic.results || []).filter((r) => r?.type === 'Video' || r?.id);
      const extra = videos
        .map((v) => ({
          id: v.id,
          title: cleanTitle(v.title?.text || v.title || ''),
          artist: v.author?.name || 'YouTube',
          thumbnail: pickThumb(v, v.id),
          duration: v.duration?.seconds || 0,
        }))
        .filter((t) => t.id && t.title);
      const seen = new Set(tracks.map((t) => t.id));
      for (const t of extra) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        tracks.push(t);
      }
    }

    res.json({ tracks: tracks.slice(0, limit), source: 'scrape' });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), tracks: [] });
  }
});

app.get('/api/artists', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 5);
    if (!q) return res.json({ artists: [] });

    const yt = await getYt();
    const music = await yt.music.search(q, { type: 'artist' });
    const list = music.artists?.contents || [];
    const artists = list
      .map((a) => {
        const id = a.id;
        const name = a.name || a.title?.text;
        const image = a.thumbnails?.[0]?.url || a.thumbnail?.contents?.[0]?.url || '';
        if (!id || !name || !image) return null;
        return {
          id: `ch_${id}`,
          name: String(name).replace(/\s*-\s*Topic\s*$/i, '').trim(),
          query: `${name} official music`,
          image,
          color: '#2D6A4F',
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    res.json({ artists, source: 'scrape' });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), artists: [] });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40);
    const yt = await getYt();
    const home = await yt.music.getHomeFeed();
    const sections = home.sections || [];
    const preferred =
      sections.find((s) => /trend|popular|chart|ascolt/i.test(s.header?.title?.text || '')) ||
      sections.find((s) => /quick picks|scelte/i.test(s.header?.title?.text || '')) ||
      sections[0];

    const items = preferred?.contents || [];
    const tracks = items.map(mapSongItem).filter(Boolean).slice(0, limit);
    if (tracks.length) return res.json({ tracks, source: 'scrape' });

    // Fallback: generic music search
    const classic = await yt.search('trending music italy', { type: 'video' });
    const videos = (classic.results || []).filter((r) => r?.id);
    res.json({
      tracks: videos
        .map((v) => ({
          id: v.id,
          title: cleanTitle(v.title?.text || v.title || ''),
          artist: v.author?.name || 'YouTube',
          thumbnail: pickThumb(v, v.id),
          duration: v.duration?.seconds || 0,
        }))
        .filter((t) => t.id && t.title)
        .slice(0, limit),
      source: 'scrape',
    });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), tracks: [] });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (!ids.length) return res.json({ tracks: [] });

    const yt = await getYt();
    const tracks = [];
    for (const id of ids) {
      try {
        const info = await yt.getBasicInfo(id);
        const title = info.basic_info?.title;
        if (!title) continue;
        tracks.push({
          id,
          title: cleanTitle(title),
          artist: info.basic_info?.author || 'YouTube',
          thumbnail: ytThumb(id),
          duration: info.basic_info?.duration || 0,
          viewCount: info.basic_info?.view_count,
        });
      } catch {
        // skip missing
      }
    }
    res.json({ tracks, source: 'scrape' });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), tracks: [] });
  }
});

app.get('/api/related/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 16, 1), 30);
    if (!id) return res.json({ tracks: [] });

    const yt = await getYt();
    try {
      const related = await yt.music.getRelated(id);
      const contents = related?.contents || related?.results || [];
      const tracks = contents.map(mapSongItem).filter(Boolean).slice(0, limit);
      if (tracks.length) return res.json({ tracks, source: 'scrape' });
    } catch {
      // fall through
    }

    const info = await yt.getBasicInfo(id);
    const title = info.basic_info?.title || '';
    const author = info.basic_info?.author || '';
    const q = `${author} ${title}`.trim() || id;
    const music = await yt.music.search(q, { type: 'song' });
    const songs = music.songs?.contents || [];
    res.json({
      tracks: songs.map(mapSongItem).filter(Boolean).slice(0, limit),
      source: 'scrape',
    });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), tracks: [] });
  }
});

app.get('/api/stream/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'missing id' });
    const url = await resolveStream(id);
    // Prefetch leading audio bytes so the next play is instant
    void warmHead(id).catch(() => undefined);
    res.json({ url, proxy: `/api/audio/${encodeURIComponent(id)}`, source: 'scrape-proxy' });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

/**
 * Pipe audio through this server (phone never hits googlevideo — IP-bound).
 * Serves a RAM head-cache first so prefetched tracks start in <100ms.
 */
async function pipeAudio(req, res) {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).end();

  let head;
  try {
    head = await warmHead(id);
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err) });
  }

  const { start, end } = parseRange(req.headers.range, head.total);
  const length = end - start + 1;

  res.setHeader('Content-Type', head.contentType || 'audio/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method === 'HEAD') {
    res.status(req.headers.range ? 206 : 200);
    res.setHeader('Content-Length', String(length));
    if (req.headers.range) {
      res.setHeader('Content-Range', `bytes ${start}-${end}/${head.total}`);
    }
    return res.end();
  }

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on('close', onClose);

  try {
    // Entire response fits in the prefetched head → instant
    if (end < head.buf.length) {
      const chunk = head.buf.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${head.total}`);
      res.setHeader('Content-Length', String(chunk.length));
      return res.end(chunk);
    }

    // Starts inside head: flush RAM bytes, then pipe the rest from upstream
    if (start < head.buf.length) {
      const fromHead = head.buf.subarray(start);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${head.total}`);
      res.setHeader('Content-Length', String(length));
      res.write(fromHead);

      const next = head.buf.length;
      if (next > end) return res.end();

      const upstream = await fetch(head.url, {
        headers: upstreamHeaders(`bytes=${next}-${end}`),
        signal: controller.signal,
      });
      if (!upstream.ok && upstream.status !== 206) {
        streamCache.delete(id);
        headCache.delete(id);
        return res.end();
      }
      if (!upstream.body) return res.end();
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    // Seek past head — proxy that range only
    const upstream = await fetch(head.url, {
      headers: upstreamHeaders(`bytes=${start}-${end}`),
      signal: controller.signal,
    });
    if (upstream.status === 403 || upstream.status === 410) {
      streamCache.delete(id);
      headCache.delete(id);
      head = await warmHead(id);
      const retry = await fetch(head.url, {
        headers: upstreamHeaders(`bytes=${start}-${end}`),
        signal: controller.signal,
      });
      if (!retry.ok && retry.status !== 206) {
        return res.status(502).json({ error: `upstream ${retry.status}` });
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${head.total}`);
      res.setHeader('Content-Length', String(length));
      if (!retry.body) return res.end();
      return Readable.fromWeb(retry.body).pipe(res);
    }
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).json({ error: `upstream ${upstream.status}` });
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${head.total}`);
    res.setHeader('Content-Length', String(length));
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    streamCache.delete(id);
    headCache.delete(id);
    if (!res.headersSent) {
      res.status(502).json({ error: String(err?.message || err) });
    }
  } finally {
    req.off('close', onClose);
  }
}

app.head('/api/audio/:id', pipeAudio);
app.get('/api/audio/:id', pipeAudio);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[lyra-scrape] YouTube scrape API on http://0.0.0.0:${PORT}`);
});
