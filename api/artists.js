const { cors } = require('./_lib/invidious');
const { searchChannels } = require('./_lib/search');

const COLORS = ['#3B82F6', '#2563EB', '#1D4ED8', '#60A5FA', '#1E3A5F'];

function colorForId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % COLORS.length;
  return COLORS[h];
}

function allowedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h.includes('ytimg.com') ||
    h.includes('ggpht.com') ||
    h.includes('googleusercontent.com') ||
    // Piped / Invidious image proxies (channel avatars)
    h.includes('piped') ||
    h.endsWith('.private.coffee') ||
    h.includes('invidious') ||
    h.includes('nedoko') ||
    h.includes('omada.cafe') ||
    h.includes('schenkel') ||
    h.includes('echostreamz')
  );
}

/** Same-origin cover proxy (Hobby plan: folded into artists — no 13th function). */
async function proxyImage(req, res) {
  const raw = String(req.query.u || req.query.url || '').trim();
  if (!raw) return res.status(400).json({ error: 'missing u' });

  let target;
  try {
    target = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
  } catch {
    return res.status(400).json({ error: 'bad url' });
  }

  if (target.protocol !== 'https:' || !allowedHost(target.hostname)) {
    return res.status(403).json({ error: 'host not allowed' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
    }
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/') && !type.includes('octet-stream')) {
      return res.status(415).json({ error: 'not an image' });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length < 200) return res.status(502).json({ error: 'empty' });

    res.setHeader('Content-Type', type.startsWith('image/') ? type : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch {
    return res.status(502).json({ error: 'fetch failed' });
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Cover proxy: /api/artists?u=<encoded image url>
  if (req.query.u || req.query.url) {
    return proxyImage(req, res);
  }

  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 24);
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
