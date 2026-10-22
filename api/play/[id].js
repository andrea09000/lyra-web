const { cors } = require('../_lib/invidious');
const { resolvePlayable } = require('../_lib/stream');

/**
 * Resolve a browser-playable audio URL for a video id.
 * Direct Invidious-proxied AAC when possible; otherwise client uses /api/audio.
 *
 * GET /api/play/:id
 */
module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    const playable = await Promise.race([
      resolvePlayable(id),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({
      id,
      url: playable.url || proxy,
      mime: playable.mime || 'audio/mp4',
      mode: playable.mode,
      proxy,
      bitrate: playable.bitrate || 0,
    });
  } catch (err) {
    // Always answer fast with proxy fallback — never hang the app
    return res.status(200).json({
      id,
      url: proxy,
      mime: 'audio/mp4',
      mode: 'proxy',
      proxy,
      error: String(err?.message || err),
    });
  }
};
