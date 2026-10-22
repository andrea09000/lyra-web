const { withInv, mapVideo, cors } = require('./_lib/invidious');

/** Batch video metadata — used by library refresh on web. */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!ids.length) return res.status(200).json({ tracks: [] });

  const found = new Map();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = await withInv(`/api/v1/videos/${encodeURIComponent(id)}`);
        const mapped = mapVideo({ ...data, videoId: data?.videoId || id });
        if (mapped) found.set(id, mapped);
      } catch {
        // skip missing
      }
    })
  );

  const tracks = ids.map((id) => found.get(id)).filter(Boolean);
  return res.status(200).json({ tracks, source: 'vercel' });
};
