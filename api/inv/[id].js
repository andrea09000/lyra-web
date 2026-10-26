const { cors } = require('../_lib/invidious');

/**
 * Same-origin Inv bridge — browser can't CORS most public mirrors
 * (echostreamz sends invalid "*, *"). We fetch Inv from the edge and
 * rewrite googlevideo → inv-proxy URLs for <audio>.
 *
 * Prefer schenkel: its videoplayback works in Chrome <audio>.
 */
// Only mirrors whose /videoplayback works in Chrome <audio>.
// echostreamz often resolves fast but playback stalls in browser.
const PRIMARY = 'https://invidious.schenkel.eti.br';
const FALLBACKS = [
  'https://invidious.kemonomimi.nl',
  'https://yt.omada.cafe',
];

function rewrite(rawUrl, base) {
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `${base}${rawUrl}`);
    if (!u.hostname.includes('googlevideo.com') && !u.pathname.includes('videoplayback')) {
      return null;
    }
    return `${base.replace(/\/$/, '')}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

async function fromMirror(base, id) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/videos/${id}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const formats = [...(data.adaptiveFormats || [])]
    .filter((f) => f.url && String(f.type || '').startsWith('audio/'))
    .map((f) => {
      const raw = f.url.startsWith('http') ? f.url : `${base}${f.url}`;
      const proxied = rewrite(raw, base);
      return {
        url: proxied || raw,
        type: f.type,
        bitrate: String(f.bitrate || ''),
        proxied: Boolean(proxied),
      };
    })
    .filter((f) => f.proxied)
    .sort((a, b) => {
      const aSafe = /mp4|m4a|aac|mp4a/i.test(String(a.type || '')) ? 1 : 0;
      const bSafe = /mp4|m4a|aac|mp4a/i.test(String(b.type || '')) ? 1 : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;
      return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    });
  if (!formats.length) throw new Error('no audio');
  return {
    title: data.title,
    author: data.author,
    lengthSeconds: Number(data.lengthSeconds || 0),
    adaptiveFormats: formats,
    source: `inv:${new URL(base).hostname}`,
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = String(req.query.id || '').trim();
  if (!id || id.length < 11) return res.status(400).json({ error: 'invalid id' });

  try {
    let data;
    try {
      data = await fromMirror(PRIMARY, id);
    } catch {
      data = await Promise.any(FALLBACKS.map((b) => fromMirror(b, id)));
    }
    // Do NOT CDN-cache stream URLs — they are IP/time bound and go stale in minutes.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      error: String(err?.errors?.[0]?.message || err?.message || err),
    });
  }
};
