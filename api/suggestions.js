/**
 * ytify-style search suggestions — YouTube complete API (fast, edge-cacheable).
 * GET /api/suggestions?q=...&music=1
 */
const { cors } = require('./_lib/invidious');

function parseSuggestPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    // window.google.ac.h([...])  OR  bare JSON array
    const jsonText = raw.includes('window.google.ac.h(')
      ? raw.replace(/^[\s\S]*?window\.google\.ac\.h\(/, '').replace(/\)\s*;?\s*$/, '')
      : raw.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '');
    const data = JSON.parse(jsonText);
    const rows = Array.isArray(data?.[1]) ? data[1] : [];
    return rows
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function youtubeSuggest(q, music) {
  const url = new URL('https://suggestqueries-clients6.youtube.com/complete/search');
  url.searchParams.set('client', music ? 'youtube-music' : 'youtube');
  url.searchParams.set('gs_ri', music ? 'ytm' : 'youtube');
  url.searchParams.set('ds', 'yt');
  url.searchParams.set('hl', 'it');
  url.searchParams.set('gl', 'IT');
  url.searchParams.set('q', q);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: '*/*',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`suggest ${res.status}`);
  return parseSuggestPayload(await res.text());
}

/** Fallback via youtubei.js music/web suggestions when complete API is empty. */
async function innertubeSuggest(q, music) {
  const { Innertube, YTNodes } = await import('youtubei.js');
  const yt = await Innertube.create({
    lang: 'it',
    location: 'IT',
    retrieve_player: false,
  });
  if (music) {
    const suggestions = await yt.music.getSearchSuggestions(q);
    const contents = suggestions.first()?.contents || [];
    return contents
      .map((s) => {
        try {
          return s.as(YTNodes.SearchSuggestion).suggestion.toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 10);
  }
  const list = await yt.getSearchSuggestions(q);
  return (list || []).filter((s) => typeof s === 'string').slice(0, 10);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = String(req.query.q || '').trim();
  const music = req.query.music === '1' || req.query.music === 'true';

  if (!q || q.length < 2) {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ suggestions: [] });
  }

  try {
    let suggestions = await youtubeSuggest(q, music).catch(() => []);
    if (!suggestions.length) {
      suggestions = await Promise.race([
        innertubeSuggest(q, music).catch(() => []),
        new Promise((resolve) => setTimeout(() => resolve([]), 2000)),
      ]);
    }
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json({ suggestions });
  } catch (err) {
    return res.status(200).json({
      suggestions: [],
      error: String(err?.message || err),
    });
  }
};
