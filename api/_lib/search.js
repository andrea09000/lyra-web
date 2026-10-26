/**
 * Multi-source search — Invidious mirrors die often; InnerTube + Piped are the reliable path.
 */
const { cleanTitle, ytThumb, withInv, mapVideo } = require('./invidious');

const PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.kavin.rocks',
];

/** Piped image proxies die — rewrite to durable YouTube CDN when possible. */
function durableImage(raw) {
  let image = String(raw || '');
  if (image.startsWith('//')) image = `https:${image}`;
  try {
    const iu = new URL(image);
    if (iu.hostname.includes('piped') || iu.hostname.endsWith('.private.coffee')) {
      const hostHint = (iu.searchParams.get('host') || '').toLowerCase();
      if (hostHint.includes('ggpht') || hostHint.includes('googleusercontent')) {
        const q = new URLSearchParams(iu.search);
        q.delete('host');
        const qs = q.toString();
        return `https://${hostHint}${iu.pathname}${qs ? `?${qs}` : ''}`;
      }
      if (iu.pathname.includes('/ytc/')) {
        return `https://yt3.ggpht.com${iu.pathname.slice(iu.pathname.indexOf('/ytc/'))}`;
      }
      const vi = iu.pathname.match(/\/vi\/([^/]+)\//);
      if (vi) return ytThumb(vi[1]);
      // hashed avatar path still serves on ggpht
      if (iu.pathname.length > 8) {
        return `https://yt3.ggpht.com${iu.pathname}`;
      }
    }
  } catch {
    // keep
  }
  return image;
}

function videoIdFromUrl(url) {
  const m = String(url || '').match(/[?&]v=([\w-]{11})|\/watch\?v=([\w-]{11})|\/([\w-]{11})$/);
  return (m && (m[1] || m[2] || m[3])) || null;
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
        signal: AbortSignal.timeout(8000),
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
    3500
  );
  const list = Array.isArray(data) ? data : [];
  const tracks = list.map(mapVideo).filter(Boolean).slice(0, limit);
  if (!tracks.length) throw new Error('invidious empty');
  return { tracks, source: 'invidious' };
}

/**
 * Best-effort search. Prefer InnerTube (stable), then Piped, then Invidious.
 */
async function searchTracks(query, limit = 24) {
  const q = String(query || '').trim();
  if (!q) return { tracks: [], source: 'empty' };

  const searchQ = /\b(music|song|audio|official|mix|lyrics|musica|canzone)\b/i.test(q)
    ? q
    : `${q} music`;

  const errors = [];

  try {
    return await searchInnertube(searchQ, limit);
  } catch (err) {
    errors.push(`yt:${err?.message || err}`);
  }

  try {
    return await searchPiped(searchQ, limit);
  } catch (err) {
    errors.push(`piped:${err?.message || err}`);
  }

  try {
    return await searchInvidious(searchQ, limit);
  } catch (err) {
    errors.push(`inv:${err?.message || err}`);
  }

  throw new Error(errors.join(' | ') || 'search failed');
}

async function searchChannels(query, limit = 3) {
  const q = String(query || '').trim();
  if (!q) return [];

  // Piped channels
  for (const base of PIPED) {
    try {
      const res = await fetch(
        `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}&filter=channels`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const out = [];
      for (const item of data.items || []) {
        if (item.type !== 'channel' || !item.name) continue;
        const chId = String(item.url || '').replace(/^\/channel\//, '');
        if (!chId) continue;
        const image = durableImage(item.thumbnail || item.uploaderAvatar || '');
        if (!image) continue;
        out.push({
          id: `ch_${chId}`,
          name: String(item.name).replace(/\s*-\s*Topic\s*$/i, '').trim(),
          query: `${item.name} official music`,
          image,
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch {
      // next
    }
  }

  // Invidious channels
  try {
    const { data } = await withInv(
      `/api/v1/search?q=${encodeURIComponent(q)}&type=channel`,
      3500
    );
    const list = Array.isArray(data) ? data : [];
    const out = [];
    for (const ch of list) {
      if (!ch.authorId || !ch.author) continue;
      const thumbs = [...(ch.authorThumbnails || [])].sort((a, b) => b.width - a.width);
      const image = durableImage(thumbs[0]?.url || '');
      if (!image) continue;
      out.push({
        id: `ch_${ch.authorId}`,
        name: String(ch.author).replace(/\s*-\s*Topic\s*$/i, '').trim(),
        query: `${ch.author} official music`,
        image,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = { searchTracks, searchChannels, searchPiped, searchInnertube };
