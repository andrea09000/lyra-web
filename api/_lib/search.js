/**
 * Multi-source search — race InnerTube + Piped + Invidious; first good hit wins.
 */
const { cleanTitle, ytThumb, withInv, mapVideo } = require('./invidious');

const PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.syncpundit.io',
];

function videoIdFromUrl(url) {
  const m = String(url || '').match(
    /[?&]v=([\w-]{11})|\/watch\?v=([\w-]{11})|youtu\.be\/([\w-]{11})|\/([\w-]{11})$/
  );
  return (m && (m[1] || m[2] || m[3] || m[4])) || null;
}

/** Piped proxies ggpht via ?host= — unwrap to a CDN URL the phone can load. */
function normalizeChannelImage(url) {
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

function mapPipedItem(item) {
  if (!item || item.type !== 'stream') return null;
  const id = videoIdFromUrl(item.url);
  if (!id || !item.title) return null;
  return {
    id,
    title: cleanTitle(item.title),
    artist: item.uploaderName || 'YouTube',
    thumbnail: ytThumb(id),
    duration: Number(item.duration || 0),
    viewCount: Number(item.views || 0) || undefined,
  };
}

async function searchPiped(query, limit) {
  const q = encodeURIComponent(query);
  let lastErr;
  for (const base of PIPED) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/search?q=${q}&filter=videos`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(9000),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`piped ${res.status}`);
      const data = await res.json();
      const tracks = (data.items || []).map(mapPipedItem).filter(Boolean).slice(0, limit);
      if (tracks.length) return { tracks, source: `piped:${new URL(base).hostname}` };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('piped search failed');
}

async function searchInnertube(query, limit) {
  const { Innertube } = await import('youtubei.js');
  const yt = await Innertube.create({
    lang: 'it',
    location: 'IT',
    retrieve_player: false,
  });
  const result = await yt.search(query, { type: 'video' });
  const nodes = result.results || [];
  const tracks = [];
  for (const node of nodes) {
    const id = node?.id;
    const title = node?.title?.text || (typeof node?.title === 'string' ? node.title : '');
    if (!id || !title || String(id).length !== 11) continue;
    tracks.push({
      id: String(id),
      title: cleanTitle(title),
      artist: node.author?.name || 'YouTube',
      thumbnail: ytThumb(String(id)),
      duration: Number(node.duration?.seconds || 0),
      viewCount: Number(node.view_count || 0) || undefined,
    });
    if (tracks.length >= limit) break;
  }
  if (!tracks.length) throw new Error('innertube empty');
  return { tracks, source: 'innertube' };
}

async function searchInvidious(query, limit) {
  const { data } = await withInv(
    `/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    5000
  );
  const list = Array.isArray(data) ? data : [];
  const tracks = list.map(mapVideo).filter(Boolean).slice(0, limit);
  if (!tracks.length) throw new Error('invidious empty');
  return { tracks, source: 'invidious' };
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}-timeout`)), ms)),
  ]);
}

/**
 * Best-effort search. Race all sources — first non-empty wins (fast + resilient).
 */
async function searchTracks(query, limit = 24) {
  const q = String(query || '').trim();
  if (!q) return { tracks: [], source: 'empty' };

  const searchQ = /\b(music|song|audio|official|mix|lyrics|musica|canzone)\b/i.test(q)
    ? q
    : `${q} music`;

  const errors = [];
  const runners = [
    withTimeout(searchInnertube(searchQ, limit), 14000, 'yt').catch((err) => {
      errors.push(`yt:${err?.message || err}`);
      throw err;
    }),
    withTimeout(searchPiped(searchQ, limit), 10000, 'piped').catch((err) => {
      errors.push(`piped:${err?.message || err}`);
      throw err;
    }),
    withTimeout(searchInvidious(searchQ, limit), 8000, 'inv').catch((err) => {
      errors.push(`inv:${err?.message || err}`);
      throw err;
    }),
  ];

  try {
    return await Promise.any(runners);
  } catch {
    throw new Error(errors.join(' | ') || 'search failed');
  }
}

function channelFromNode(node) {
  const id =
    node?.id ||
    node?.author?.id ||
    node?.channel_id ||
    (typeof node?.author === 'object' ? node.author?.id : null);
  const name =
    node?.author?.name ||
    node?.title?.text ||
    (typeof node?.title === 'string' ? node.title : '') ||
    node?.name ||
    '';
  if (!id || !name) return null;
  let image =
    node?.author?.best_thumbnail?.url ||
    node?.author?.thumbnails?.[0]?.url ||
    node?.thumbnails?.[0]?.url ||
    node?.thumbnail?.url ||
    '';
  image = normalizeChannelImage(image);
  const cleanName = String(name).replace(/\s*-\s*Topic\s*$/i, '').replace(/\s*\(tema\)\s*$/i, '').trim();
  if (!cleanName) return null;
  return {
    id: `ch_${id}`,
    name: cleanName,
    query: `${cleanName} official music`,
    image,
  };
}

async function searchInnertubeChannels(query, limit) {
  const { Innertube } = await import('youtubei.js');
  const yt = await Innertube.create({
    lang: 'it',
    location: 'IT',
    retrieve_player: false,
  });
  const result = await yt.search(query, { type: 'channel' });
  const out = [];
  const seen = new Set();
  for (const node of result.results || []) {
    const ch = channelFromNode(node);
    if (!ch) continue;
    const key = ch.name.toLowerCase();
    if (seen.has(key) || seen.has(ch.id)) continue;
    seen.add(key);
    seen.add(ch.id);
    out.push(ch);
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('innertube channels empty');
  return out;
}

async function searchPipedChannels(query, limit) {
  let lastErr;
  for (const base of PIPED) {
    try {
      const res = await fetch(
        `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&filter=channels`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const out = [];
      const seen = new Set();
      for (const item of data.items || []) {
        if (item.type !== 'channel' || !item.name) continue;
        const chId = String(item.url || '').replace(/^\/channel\//, '');
        if (!chId) continue;
        const name = String(item.name).replace(/\s*-\s*Topic\s*$/i, '').trim();
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `ch_${chId}`,
          name,
          query: `${name} official music`,
          image: normalizeChannelImage(item.thumbnail || item.uploaderAvatar || ''),
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

async function searchInvidiousChannels(query, limit) {
  const { data } = await withInv(
    `/api/v1/search?q=${encodeURIComponent(query)}&type=channel`,
    5000
  );
  const list = Array.isArray(data) ? data : [];
  const out = [];
  const seen = new Set();
  for (const ch of list) {
    if (!ch.authorId || !ch.author) continue;
    const name = String(ch.author).replace(/\s*-\s*Topic\s*$/i, '').trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const thumbs = [...(ch.authorThumbnails || [])].sort((a, b) => b.width - a.width);
    out.push({
      id: `ch_${ch.authorId}`,
      name,
      query: `${name} official music`,
      image: normalizeChannelImage(thumbs[0]?.url || ''),
    });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('invidious channels empty');
  return out;
}

/** Artists from video search when channel APIs fail — always something to pick. */
async function searchArtistsFromVideos(query, limit) {
  const { tracks } = await searchTracks(`${query} official`, Math.max(limit * 3, 18));
  const out = [];
  const seen = new Set();
  for (const t of tracks) {
    const name = String(t.artist || '').replace(/\s*-\s*Topic\s*$/i, '').trim();
    const key = name.toLowerCase();
    if (!name || key === 'youtube' || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `art_${t.id}`,
      name,
      query: `${name} official music`,
      image: t.thumbnail || ytThumb(t.id),
    });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('video-artists empty');
  return out;
}

async function searchChannels(query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) return [];
  const cap = Math.min(Math.max(Number(limit) || 8, 1), 16);

  const errors = [];
  const runners = [
    withTimeout(searchInnertubeChannels(q, cap), 12000, 'yt-ch').catch((err) => {
      errors.push(`yt:${err?.message || err}`);
      throw err;
    }),
    withTimeout(searchPipedChannels(q, cap), 9000, 'piped-ch').catch((err) => {
      errors.push(`piped:${err?.message || err}`);
      throw err;
    }),
    withTimeout(searchInvidiousChannels(q, cap), 7000, 'inv-ch').catch((err) => {
      errors.push(`inv:${err?.message || err}`);
      throw err;
    }),
    withTimeout(searchArtistsFromVideos(q, cap), 14000, 'vid-ch').catch((err) => {
      errors.push(`vid:${err?.message || err}`);
      throw err;
    }),
  ];

  try {
    return await Promise.any(runners);
  } catch {
    // Last ditch: empty rather than throw — UI can still filter local seeds
    console.warn('[searchChannels]', errors.join(' | '));
    return [];
  }
}

module.exports = {
  searchTracks,
  searchChannels,
  searchPiped,
  searchInnertube,
  normalizeChannelImage,
};
