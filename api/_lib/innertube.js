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
async function fromRapidApi(videoId, cgeo = 'IT', timeoutMs = 2200) {
  const key = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY;
  if (!key || key === '[SENSITIVE]' || key.length < 20) return null;

  const res = await fetch(
    `https://yt-api.p.rapidapi.com/dl?id=${encodeURIComponent(videoId)}&cgeo=${cgeo}`,
    {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'yt-api.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!res.ok) throw new Error(`RapidAPI ${res.status}`);
  const data = await res.json();
  if (data?.error || data?.message === 'Forbidden' || data?.status === 'fail') {
    throw new Error(String(data.error || data.message || 'RapidAPI fail'));
  }
  const rawFormats = [
    ...(Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : []),
    ...(Array.isArray(data.formats) ? data.formats : []),
  ];
  const adaptiveFormats = rawFormats
    .filter((f) => {
      if (!f?.url) return false;
      const mime = String(f.mimeType || f.type || f.qualityLabel || '');
      return /audio|mp4a|opus|m4a/i.test(mime) || String(f.quality || '').includes('AUDIO');
    })
    .map((f) => {
      let url = String(f.url);
      if (!url.includes('fallback')) {
        url += url.includes('?') ? '&fallback' : '?fallback';
      }
      return {
        url,
        type: f.mimeType || f.type || 'audio/mp4',
        bitrate: String(f.bitrate || f.audioBitrate || ''),
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
/** videoId:fast|full -> Promise — coalesce concurrent cold resolves */
const inflight = new Map();

function rewriteThroughInv(rawUrl, instanceBase) {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes('googlevideo.com') && !u.pathname.includes('videoplayback')) {
      return rawUrl;
    }
    const base = instanceBase.replace(/\/$/, '');
    return `${base}${u.pathname}${u.search}`;
  } catch {
    return rawUrl;
  }
}

async function fromInvidiousMirrors(videoId) {
  const mirrors = [
    'https://echostreamz.com',
    'https://invidious.schenkel.eti.br',
    'https://invidious.kemonomimi.nl',
    'https://yt.omada.cafe',
  ];

  const tryOne = async (base) => {
    const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const adaptiveFormats = (data.adaptiveFormats || [])
      .filter((f) => f.url && String(f.type || '').startsWith('audio/'))
      .map((f) => {
        const raw = f.url.startsWith('http') ? f.url : `${base}${f.url}`;
        return {
          // Prefer Inv-proxied URL — raw googlevideo 403s from many networks
          url: rewriteThroughInv(raw, base),
          type: f.type,
          bitrate: String(f.bitrate || ''),
          clen: String(f.clen || ''),
        };
      });
    if (!adaptiveFormats.length) throw new Error('no audio');
    adaptiveFormats.sort((a, b) => {
      const aSafe = /mp4|m4a|aac|mp4a/i.test(String(a.type || '')) ? 1 : 0;
      const bSafe = /mp4|m4a|aac|mp4a/i.test(String(b.type || '')) ? 1 : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;
      return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    });
    return {
      title: data.title || 'Unknown',
      author: data.author || 'YouTube',
      authorId: data.authorId || '',
      lengthSeconds: Number(data.lengthSeconds || 0),
      adaptiveFormats,
      recommendedVideos: data.recommendedVideos || [],
      source: `inv:${new URL(base).hostname}`,
    };
  };

  // Race mirrors — first success wins (sequential burned 5s+ on dead hosts)
  try {
    return await Promise.any(mirrors.map((b) => tryOne(b)));
  } catch (err) {
    throw err?.errors?.[0] || err || new Error('invidious failed');
  }
}

/** Race IT + US RapidAPI — first success wins (was sequential 8s+8s). */
async function fromRapidApiRace(videoId) {
  const key = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY;
  if (!key || key === '[SENSITIVE]' || key.length < 20) return null;
  try {
    return await Promise.any([
      fromRapidApi(videoId, 'IT', 2200),
      fromRapidApi(videoId, 'US', 2200),
    ]);
  } catch (err) {
    throw err?.errors?.[0] || err || new Error('RapidAPI race failed');
  }
}

/**
 * @param {string} videoId
 * @param {{ fast?: boolean }} [opts] fast=true skips youtubei (too slow for /api/audio TTFB)
 */
async function resolveInnertube(videoId, opts = {}) {
  const hit = cache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.data;

  const fast = opts.fast === true;
  const key = `${videoId}:${fast ? 'f' : 's'}`;
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    let data = null;
    let lastErr;

    // Fast path: race RapidAPI ∥ Inv — sequential burned the whole budget on RapidAPI fails
    if (fast) {
      try {
        data = await Promise.any([
          fromRapidApiRace(videoId).then((d) => {
            if (!d?.adaptiveFormats?.length) throw new Error('rapid empty');
            return d;
          }),
          fromInvidiousMirrors(videoId),
        ]);
      } catch (err) {
        lastErr = err?.errors?.[0] || err;
      }
    } else {
      // 1) RapidAPI
      try {
        data = await fromRapidApiRace(videoId);
      } catch (err) {
        lastErr = err;
      }

      // 2) youtubei.js (cipher / age / hard IDs)
      if (!data) {
        try {
          data = await fromYoutubei(videoId);
        } catch (err) {
          lastErr = err;
        }
      }

      // 3) Public Invidious mirrors
      if (!data) {
        try {
          data = await fromInvidiousMirrors(videoId);
        } catch (err) {
          lastErr = err;
        }
      }
    }

    if (!data) throw lastErr || new Error('InnerTube fallback failed');

    cache.set(videoId, { data, expires: Date.now() + 12 * 60 * 1000 });
    return data;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

function dropInnertubeCache(videoId) {
  if (videoId) cache.delete(videoId);
  else cache.clear();
}

module.exports = { resolveInnertube, fromYoutubei, fromRapidApi, dropInnertubeCache };
