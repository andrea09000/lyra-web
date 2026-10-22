const { cors } = require('./_lib/invidious');

/**
 * Resolve a public Spotify playlist / album / track → song list.
 * Uses ONLY the public embed page (no Spotify Web API, no Premium).
 *
 * GET /api/spotify?url=https://open.spotify.com/playlist/...
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseSpotifyRef(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  const uri = s.match(/^spotify:(playlist|album|track):([a-zA-Z0-9]+)$/);
  if (uri) return { type: uri[1], id: uri[2] };

  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\./, '');
    if (!host.includes('spotify.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let type = null;
    let id = null;
    for (let i = 0; i < parts.length; i++) {
      if (['playlist', 'album', 'track'].includes(parts[i]) && parts[i + 1]) {
        type = parts[i];
        id = parts[i + 1].split('?')[0];
        break;
      }
    }
    if (type && id) return { type, id };
  } catch {
    // not a URL
  }

  if (/^[a-zA-Z0-9]{22}$/.test(s)) return { type: 'playlist', id: s };
  return null;
}

function songsFromEntity(entity, ref) {
  const trackList = Array.isArray(entity.trackList) ? entity.trackList : [];
  const songs = [];

  if (ref.type === 'track' && entity.title) {
    songs.push({
      title: String(entity.title),
      artist: String(entity.subtitle || entity.authors?.[0]?.name || 'Unknown')
        .replace(/\u00a0/g, ' ')
        .trim(),
      album: '',
      durationMs: Number(entity.duration) || 0,
      spotifyId: String(entity.id || ref.id),
    });
    return songs;
  }

  for (const t of trackList) {
    const title = String(t.title || '').trim();
    const artist = String(t.subtitle || '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!title || !artist) continue;
    const uri = String(t.uri || '');
    const id = uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : '';
    songs.push({
      title,
      artist,
      album: '',
      durationMs: Number(t.duration) || 0,
      spotifyId: id,
    });
  }
  return songs;
}

function parseNextData(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Public embed — no API keys, no Premium.
 * Also tries the open.spotify.com page as backup.
 */
async function fromPublicPages(ref) {
  const urls = [
    `https://open.spotify.com/embed/${ref.type}/${ref.id}`,
    `https://open.spotify.com/embed/${ref.type}/${ref.id}?utm_source=generator`,
    `https://open.spotify.com/${ref.type}/${ref.id}`,
  ];

  let lastErr;
  for (const pageUrl of urls) {
    try {
      const html = await fetchHtml(pageUrl);
      const next = parseNextData(html);
      if (!next) {
        lastErr = new Error('Pagina senza dati');
        continue;
      }

      // Embed shape
      let entity = next?.props?.pageProps?.state?.data?.entity;

      // Full page sometimes nests differently
      if (!entity) {
        entity =
          next?.props?.pageProps?.state?.data?.default?.entity ||
          next?.props?.pageProps?.entity ||
          null;
      }

      if (!entity) {
        lastErr = new Error('Playlist non trovata');
        continue;
      }

      const songs = songsFromEntity(entity, ref);
      if (!songs.length && ref.type !== 'track') {
        lastErr = new Error('Nessun brano nell’embed (playlist privata?)');
        continue;
      }

      const author =
        (entity.authors || []).map((a) => a.name).filter(Boolean).join(', ') ||
        String(entity.subtitle || '');

      return {
        title: entity.name || entity.title || 'Playlist Spotify',
        author,
        type: entity.type || ref.type,
        songs,
        source: 'spotify-embed',
      };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Impossibile leggere Spotify');
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/premium/i.test(msg)) {
    return 'Non serve Premium. Rendi la playlist Pubblica su Spotify (⋯ → Aggiungi alla profili / Rendi pubblica), copia di nuovo il link e riprova.';
  }
  if (/private|403|401/i.test(msg)) {
    return 'Playlist privata o non accessibile. Su Spotify: ⋯ → Rendi pubblica, poi ricopia il link.';
  }
  return msg || 'Impossibile leggere Spotify. Usa una playlist pubblica.';
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = String(req.query.url || req.query.q || '').trim();
  const ref = parseSpotifyRef(url);
  if (!ref) {
    return res.status(400).json({
      error: 'Link Spotify non valido. Usa un link playlist, album o brano.',
      songs: [],
    });
  }

  try {
    const data = await fromPublicPages(ref);
    if (!data.songs?.length) {
      return res.status(502).json({
        error:
          'Nessun brano trovato. La playlist deve essere pubblica (su Spotify: ⋯ → Rendi pubblica).',
        songs: [],
      });
    }

    return res.status(200).json({
      id: ref.id,
      type: data.type || ref.type,
      title: data.title,
      author: data.author,
      songs: data.songs,
      total: data.songs.length,
      source: data.source,
    });
  } catch (err) {
    return res.status(502).json({
      error: friendlyError(err),
      songs: [],
    });
  }
};
