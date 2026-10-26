const { cors } = require('../_lib/invidious');
const { resolveDirectAudioUrl, clientPrefersOpus } = require('../_lib/stream');

/**
 * Instant play kick: resolve URL then 302 to the CDN.
 * <audio src="/api/go/ID"> — browser streams googlevideo directly (ytify-style).
 * Falls back to /api/audio if resolve fails.
 */
module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = String(req.query.id || '').trim();
  if (!id || id.length < 11) {
    return res.status(400).json({ error: 'invalid id' });
  }

  const origin =
    (req.headers['x-forwarded-proto'] || 'https') +
    '://' +
    (req.headers['x-forwarded-host'] || req.headers.host || '');
  const proxy = `${origin}/api/audio/${encodeURIComponent(id)}`;

  try {
    const preferOpus = clientPrefersOpus(req);
    const { url, contentType } = await resolveDirectAudioUrl(id, { preferOpus });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=180');
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.redirect(302, url);
  } catch {
    res.setHeader('Cache-Control', 'public, s-maxage=10');
    return res.redirect(302, proxy);
  }
};
