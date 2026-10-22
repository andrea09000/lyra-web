/**
 * Piano B (ytify-style): resolve audio formats via youtubei.js (InnerTube)
 * and optionally RapidAPI if RAPIDAPI_KEY is set.
 */

let ytPromise = null;

async function getYt() {
  if (!ytPromise) {
    ytPromise = import('youtubei.js')
      .then(({ Innertube }) =>
        Innertube.create({
          lang: 'it',
          location: 'IT',
          retrieve_player: true,
        }),
      )
      .catch((err) => {
        ytPromise = null;
        throw err;
      });
  }
  return ytPromise;
}

async function formatUrl(format, yt) {
  if (!format) return null;
  if (format.url) return String(format.url);
  try {
    if (typeof format.decipher === 'function') {
      const u = await format.decipher(yt.session.player);
      return u ? String(u) : null;
    }
  } catch {
    // no decipher
  }
  return null;
}

/**
 * @returns {Promise<{ title, author, authorId, lengthSeconds, adaptiveFormats: Array }>}
 */
async function fromYoutubei(videoId) {
  const yt = await getYt();
  const clients = [undefined, 'IOS', 'ANDROID', 'TV', 'MWEB'];
  let lastErr;

  for (const client of clients) {
    try {
      const info = client
        ? await yt.getBasicInfo(videoId, client)
        : await yt.getBasicInfo(videoId);

      const formats = (info.streaming_data?.adaptive_formats || []).filter((f) =>
        String(f.mime_type || '').startsWith('audio/'),
      );

      const adaptiveFormats = [];
      for (const f of formats) {
        const url = await formatUrl(f, yt);
        if (!url) continue;
        adaptiveFormats.push({
          url,
          type: f.mime_type || 'audio/mp4',
          bitrate: String(f.bitrate || ''),
          clen: String(f.content_length || ''),
          itag: f.itag,
        });
      }

      if (!adaptiveFormats.length) {
        lastErr = new Error('no audio urls');
        continue;
      }

      // AAC/MP4 first (Safari), then bitrate
      adaptiveFormats.sort((a, b) => {
        const aSafe = /mp4|m4a|aac|mp4a/i.test(String(a.type || '')) ? 1 : 0;
        const bSafe = /mp4|m4a|aac|mp4a/i.test(String(b.type || '')) ? 1 : 0;
        if (aSafe !== bSafe) return bSafe - aSafe;
        const na = Number(a.bitrate || 0);
        const nb = Number(b.bitrate || 0);
        const ba = na > 0 && na < 2000 ? na * 1000 : na;
        const bb = nb > 0 && nb < 2000 ? nb * 1000 : nb;
        return bb - ba;
      });

      return {
        title: info.basic_info?.title || 'Unknown',
        author: info.basic_info?.author || 'YouTube',
        authorId: info.basic_info?.channel_id || '',
        lengthSeconds: Number(info.basic_info?.duration || 0),
        adaptiveFormats,
        recommendedVideos: [],
        source: `youtubei${client ? `:${client}` : ''}`,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('youtubei failed');
}

/** ytify edge uses RapidAPI yt-api — optional if RAPIDAPI_KEY is set. */
async function fromRapidApi(videoId, cgeo = 'IT') {
  const key = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://yt-api.p.rapidapi.com/dl?id=${encodeURIComponent(videoId)}&cgeo=${cgeo}`,
    {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'yt-api.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`RapidAPI ${res.status}`);
  const data = await res.json();
  const adaptiveFormats = (data.adaptiveFormats || [])
    .filter((f) => f.url && String(f.mimeType || f.type || '').includes('audio'))
    .map((f) => {
      let url = String(f.url);
      if (!url.includes('fallback')) {
        url += url.includes('?') ? '&fallback' : '?fallback';
      }
      return {
        url,
        type: f.mimeType || f.type || 'audio/mp4',
        bitrate: String(f.bitrate || ''),
        clen: String(f.contentLength || f.clen || ''),
      };
    });

  if (!adaptiveFormats.length) throw new Error('RapidAPI no audio');

  adaptiveFormats.sort((a, b) => {
    const aSafe = /mp4|m4a|aac|mp4a/i.test(String(a.type || '')) ? 1 : 0;
    const bSafe = /mp4|m4a|aac|mp4a/i.test(String(b.type || '')) ? 1 : 0;
    if (aSafe !== bSafe) return bSafe - aSafe;
    const na = Number(a.bitrate || 0);
    const nb = Number(b.bitrate || 0);
    const ba = na > 0 && na < 2000 ? na * 1000 : na;
    const bb = nb > 0 && nb < 2000 ? nb * 1000 : nb;
    return bb - ba;
  });

  return {
    title: data.title || 'Unknown',
    author: data.channelTitle || data.author || 'YouTube',
    authorId: data.channelId || data.authorId || '',
    lengthSeconds: parseInt(data.lengthSeconds || '0', 10) || 0,
    adaptiveFormats,
    recommendedVideos: [],
    source: 'rapidapi',
  };
}

const cache = new Map();

async function fromInvidiousMirrors(videoId) {
  const mirrors = [
    'https://yt.omada.cafe',
    'https://echostreamz.com',
    'https://invidious.f5.si',
    'https://invidious.schenkel.eti.br',
  ];
  let lastErr;
  for (const base of mirrors) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const adaptiveFormats = (data.adaptiveFormats || [])
        .filter((f) => f.url && String(f.type || '').startsWith('audio/'))
        .map((f) => ({
          url: f.url.startsWith('http') ? f.url : `${base}${f.url}`,
          type: f.type,
          bitrate: String(f.bitrate || ''),
          clen: String(f.clen || ''),
        }));
      if (!adaptiveFormats.length) throw new Error('no audio');
      return {
        title: data.title || 'Unknown',
        author: data.author || 'YouTube',
        authorId: data.authorId || '',
        lengthSeconds: Number(data.lengthSeconds || 0),
        adaptiveFormats,
        recommendedVideos: data.recommendedVideos || [],
        source: `inv:${new URL(base).hostname}`,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('invidious failed');
}

async function resolveInnertube(videoId) {
  const hit = cache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.data;

  let data = null;
  let lastErr;

  // 1) RapidAPI (same as ytify edge) — only if RAPIDAPI_KEY is set
  try {
    data = await fromRapidApi(videoId);
  } catch (err) {
    lastErr = err;
  }

  // 2) youtubei.js InnerTube
  if (!data) {
    try {
      data = await fromYoutubei(videoId);
    } catch (err) {
      lastErr = err;
    }
  }

  // 3) Public Invidious mirrors (always available)
  if (!data) {
    try {
      data = await fromInvidiousMirrors(videoId);
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data) throw lastErr || new Error('InnerTube fallback failed');

  cache.set(videoId, { data, expires: Date.now() + 12 * 60 * 1000 });
  return data;
}

function dropInnertubeCache(videoId) {
  if (videoId) cache.delete(videoId);
  else cache.clear();
}

module.exports = { resolveInnertube, fromYoutubei, fromRapidApi, dropInnertubeCache };
