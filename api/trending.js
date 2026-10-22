const { cors } = require('./_lib/invidious');
const { searchTracks } = require('./_lib/search');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40);
    const { tracks, source } = await searchTracks('trending music italy mix', limit);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ tracks, source: `trending:${source}` });
  } catch (err) {
    return res.status(502).json({
      error: String(err?.message || err),
      tracks: [],
    });
  }
};
