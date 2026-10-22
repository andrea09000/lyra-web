const { cors } = require('../_lib/invidious');
const { resolveInnertube } = require('../_lib/innertube');

/**
 * Piano B — ytify `/s/:id` equivalent.
 * Returns Invidious-shaped JSON with adaptiveFormats from InnerTube / RapidAPI.
 */
module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = String(req.query.id || '').trim();
  if (!id || id.length < 11) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    const data = await resolveInnertube(id);

    // Also expose a same-origin proxy URL — googlevideo from Vercel IP is often
    // bound to the resolver; the phone can play via /api/audio instead.
    const origin =
      (req.headers['x-forwarded-proto'] || 'https') +
      '://' +
      (req.headers['x-forwarded-host'] || req.headers.host || '');

    // Proxy last — client should try direct / inv-proxy URLs first
    const proxyUrl = `${origin}/api/audio/${encodeURIComponent(id)}`;
    const adaptiveFormats = [
      // Already bitrate-sorted by InnerTube; proxy is reliability fallback only
      ...(data.adaptiveFormats || []),
      {
        url: proxyUrl,
        type: 'audio/mp4',
        bitrate: '0',
        itag: 'proxy',
      },
    ];

    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).json({
      title: data.title,
      author: data.author,
      authorId: data.authorId,
      lengthSeconds: data.lengthSeconds,
      adaptiveFormats,
      recommendedVideos: data.recommendedVideos || [],
      source: data.source || 'innertube',
    });
  } catch (err) {
    return res.status(502).json({
      error: String(err?.message || err),
      message: 'InnerTube fallback failed',
    });
  }
};
