const { cors } = require('./_lib/invidious');
const { searchTracks } = require('./_lib/search');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 40);
    if (!q) return res.status(200).json({ tracks: [] });

    const { tracks, source } = await searchTracks(q, limit);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ tracks, source });
  } catch (err) {
    return res.status(502).json({
      error: String(err?.message || err),
      tracks: [],
    });
  }
};
