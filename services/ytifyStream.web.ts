/**
 * ytify-faithful stream resolve for web <audio>.
 * Mirrors getStreamData + preferredStream + proxyHandler + audioErrorHandler.
 */

import {
  peekScrapeCandidates,
  peekScrapeUrl,
  scrapeAudioCandidates,
  type AudioCandidate,
} from '@/services/ytScrape.web';
import { peekPlayResolve, resolvePlayUrl } from '@/services/playResolve.web';

const STICKY_KEY = 'vybe-sticky-inv';

const INV = [
  'https://yt.omada.cafe',
  'https://invidious.schenkel.eti.br',
  'https://invidious.kemonomimi.nl',
  'https://echostreamz.com',
];

function supportsOpus(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const el = document.createElement('audio');
    return Boolean(el.canPlayType('audio/webm; codecs="opus"'));
  } catch {
    return false;
  }
}

export function getStickyInv(): string | null {
  try {
    const v = sessionStorage.getItem(STICKY_KEY);
    if (v && INV.includes(v)) return v;
  } catch {
    // ignore
  }
  return null;
}

/**
 * ytify proxyHandler — music app always rewrites googlevideo → sticky Inv
 * (ytify does this for "- Topic" channels; Vybe is music-first).
 */
export function proxyHandler(url: string): string {
  if (!url || url.includes('/api/audio/') || url.includes('/api/go/')) return url;
  if (url.includes('&fallback')) return url;
  try {
    const u = new URL(url);
    const sticky = getStickyInv() || INV[0];
    if (!sticky) return url;
    const stickyOrigin = sticky.replace(/\/$/, '');
    if (INV.some((b) => url.startsWith(b.replace(/\/$/, '')))) return url;
    if (u.hostname.includes('googlevideo.com') || u.pathname.includes('videoplayback')) {
      return `${stickyOrigin}${u.pathname}${u.search}`;
    }
  } catch {
    // ignore
  }
  return url;
}

function invProxyScore(c: AudioCandidate): number {
  if (c.source.includes('inv-proxy') || c.source.startsWith('api-inv:')) return 2;
  if (c.source.startsWith('fallback:')) return 1;
  return 0;
}

/** ytify preferredStream — itag medium, Inv-proxy preferred. */
export function preferredCandidate(list: AudioCandidate[]): AudioCandidate | null {
  const playable = list.filter(
    (c) => c.url && !c.url.includes('/api/audio/') && !c.url.includes('/api/go/')
  );
  if (!playable.length) return null;

  const opus = supportsOpus();
  // AAC (140) first — Opus via Inv often moves the seek bar with no audible output
  const itags = [140, 139, 250, 249, 251];

  for (const itag of itags) {
    const matches = playable.filter((c) => c.url.includes(`itag=${itag}`));
    if (!matches.length) continue;
    matches.sort((a, b) => invProxyScore(b) - invProxyScore(a));
    return { ...matches[0], url: proxyHandler(matches[0].url) };
  }

  const ranked = [...playable].sort((a, b) => {
    const inv = invProxyScore(b) - invProxyScore(a);
    if (inv) return inv;
    const aOpus = /webm|opus/i.test(String(a.mime || '')) ? 1 : 0;
    const bOpus = /webm|opus/i.test(String(b.mime || '')) ? 1 : 0;
    if (opus && aOpus !== bOpus) return bOpus - aOpus;
    if (!opus) {
      const aSafe = /mp4|m4a|aac/i.test(String(a.mime || '')) ? 1 : 0;
      const bSafe = /mp4|m4a|aac/i.test(String(b.mime || '')) ? 1 : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;
    }
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
  const best = ranked[0];
  return best ? { ...best, url: proxyHandler(best.url) } : null;
}

/**
 * ytify audioErrorHandler — rewrite googlevideo / dead Inv → next sticky Inv.
 */
export function rewriteFailedSrc(src: string): string | null {
  if (!src || src.includes('/api/audio/') || src.includes('/api/go/')) return null;
  if (src.includes('&fallback')) return null;
  try {
    const u = new URL(src);
    const sticky = getStickyInv() || INV[0];
    if (!sticky) return null;

    if (INV.some((b) => src.startsWith(b.replace(/\/$/, '')))) {
      const idx = INV.findIndex((b) => src.startsWith(b.replace(/\/$/, '')));
      const next = INV[(idx + 1) % INV.length];
      return `${next.replace(/\/$/, '')}${u.pathname}${u.search}`;
    }
    if (u.hostname.includes('googlevideo.com') || u.pathname.includes('videoplayback')) {
      return `${sticky.replace(/\/$/, '')}${u.pathname}${u.search}`;
    }
  } catch {
    // ignore
  }
  return null;
}

function isDirect(url: string): boolean {
  return Boolean(url) && !url.includes('/api/audio/') && !url.includes('/api/go/');
}

/** Instant peek — ytify streamCache.get */
export function peekPlayableUrl(videoId: string): string | null {
  const fromScrape = preferredCandidate(peekScrapeCandidates(videoId));
  if (fromScrape?.url) return fromScrape.url;

  const cached = peekScrapeUrl(videoId);
  if (cached && isDirect(cached)) return proxyHandler(cached);

  const play = peekPlayResolve(videoId);
  if (play?.url && isDirect(play.url)) return proxyHandler(play.url);
  return null;
}

function sameOriginProxy(videoId: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin || !videoId) return null;
  return `${window.location.origin}/api/audio/${encodeURIComponent(videoId)}`;
}

/**
 * ytify player(): scrape first (user IP → Inv), race /api/play, then /api/audio.
 */
export function resolvePlayableUrl(
  videoId: string,
  ms = 5000
): Promise<string | null> {
  const peeked = peekPlayableUrl(videoId);
  if (peeked) return Promise.resolve(peeked);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (url: string | null) => {
      if (settled || !url) return;
      settled = true;
      clearTimeout(timer);
      resolve(isDirect(url) ? proxyHandler(url) : url);
    };

    // Primary: browser → Inv (ytify getStreamData)
    void scrapeAudioCandidates(videoId)
      .then((list) => {
        const best = preferredCandidate(list);
        if (best?.url) finish(best.url);
      })
      .catch(() => undefined);

    // Parallel: /api/play (RapidAPI / server Inv)
    void resolvePlayUrl(videoId, ms)
      .then((r) => {
        if (r?.url && isDirect(r.url)) finish(r.url);
      })
      .catch(() => undefined);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(peekPlayableUrl(videoId) || sameOriginProxy(videoId));
    }, ms + 600);
  });
}
