const { withInv, mapVideo, cors } = require('../_lib/invidious');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const id = String(req.query.id || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 16, 1), 30);
    if (!id) return res.status(200).json({ tracks: [] });

    const { data } = await withInv(`/api/v1/videos/${encodeURIComponent(id)}`);
    const related = data?.recommendedVideos || [];
    const tracks = related.map(mapVideo).filter(Boolean).slice(0, limit);
    res.status(200).json({ tracks, source: 'vercel' });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), tracks: [] });
  }
};
