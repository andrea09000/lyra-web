const { cors } = require('./_lib/invidious');
const { searchChannels } = require('./_lib/search');

const COLORS = ['#3B82F6', '#2563EB', '#1D4ED8', '#60A5FA', '#1E3A5F'];

function colorForId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % COLORS.length;
  return COLORS[h];
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 5);
    if (!q) return res.status(200).json({ artists: [] });

    const channels = await searchChannels(q, limit);
    const artists = channels.map((a) => ({
      ...a,
      color: colorForId(a.id),
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ artists, source: 'search' });
  } catch (err) {
    return res.status(502).json({
      error: String(err?.message || err),
      artists: [],
    });
  }
};
