const INV = [
  'https://yt.omada.cafe',
  'https://invidious.schenkel.eti.br',
  'https://echostreamz.com',
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://yewtu.be',
];

function cleanTitle(title) {
  return String(title || '')
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/official\s*audio/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ytThumb(id) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

function mapVideo(v) {
  if (!v?.videoId || !v?.title) return null;
  if (v.type && v.type !== 'video') return null;
  return {
    id: v.videoId,
    title: cleanTitle(v.title),
    artist: v.author || 'YouTube',
    thumbnail: ytThumb(v.videoId),
    duration: v.lengthSeconds || 0,
    viewCount: v.viewCount,
  };
}

async function fetchJson(url, ms = 4500) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) throw new Error('HTML instead of JSON');
  return res.json();
}

async function withInv(path, ms = 4500) {
  let last;
  const tasks = INV.slice(0, 3).map((base) =>
    fetchJson(`${base.replace(/\/$/, '')}${path}`, ms).then((data) => ({ base, data }))
  );
  try {
    return await Promise.any(tasks);
  } catch (err) {
    last = err;
  }
  for (const base of INV.slice(3)) {
    try {
      const data = await fetchJson(`${base.replace(/\/$/, '')}${path}`, ms);
      return { base, data };
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('Nessuna istanza');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { INV, cleanTitle, ytThumb, mapVideo, fetchJson, withInv, cors };
