const { cors } = require('../_lib/invidious');
const { getHead, resolveDirectAudioUrl, clientPrefersOpus } = require('../_lib/stream');

/**
 * ytify-style play resolve — returns raw CDN URL for <audio src>.
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
  const go = `${origin}/api/go/${encodeURIComponent(id)}`;

  try {
    const preferOpus = clientPrefersOpus(req);
    const { url, contentType } = await resolveDirectAudioUrl(id, { preferOpus });
    res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=300');
    return res.status(200).json({
      id,
      url,
      mime: contentType || 'audio/mp4',
      mode: 'direct',
      proxy,
      go,
      source: preferOpus ? 'resolve-opus' : 'resolve-aac',
    });
  } catch {
    // fall through
  }

  void getHead(id).catch(() => undefined);

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return res.status(200).json({
    id,
    url: go,
    mime: 'audio/mp4',
    mode: 'go',
    proxy,
    go,
  });
};
