/**
 * Demus-style cover cache (Kingfisher analog):
 * memory + Cache Storage disk, ImagePrefetcher warm, /api/img fallback.
 */

import { optimizeThumbUrl } from '@/services/thumbUrl';

const CACHE_NAME = 'vybe-covers-v1';
const MAX_ENTRIES = 400;
const CONCURRENCY = 8;

/** remote URL → live blob: */
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const queued = new Set<string>();
let running = 0;
const waiters: Array<() => void> = [];

/** Prefer durable YouTube CDN over flaky Piped image proxies. */
function unwrapPipedImageProxy(u: string): string {
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('piped') && !host.endsWith('.private.coffee')) return u;
    const hostHint = (parsed.searchParams.get('host') || '').toLowerCase();
    if (hostHint.includes('ggpht') || hostHint.includes('googleusercontent')) {
      const q = new URLSearchParams(parsed.search);
      q.delete('host');
      const qs = q.toString();
      return `https://${hostHint}${parsed.pathname}${qs ? `?${qs}` : ''}`;
    }
    if (parsed.pathname.includes('/ytc/')) {
      return `https://yt3.ggpht.com${parsed.pathname.slice(parsed.pathname.indexOf('/ytc/'))}`;
    }
    const vi = parsed.pathname.match(/\/vi\/([^/]+)\//);
    if (vi) return `https://i.ytimg.com${parsed.pathname}`;
    if (parsed.pathname.length > 8) {
      return `https://yt3.ggpht.com${parsed.pathname}`;
    }
  } catch {
    // ignore
  }
  return u;
}

/** Normalize protocol-relative / http / piped-proxied artist thumbs. */
export function normalizeCoverUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  if (u.startsWith('blob:') || u.startsWith('data:')) return u;
  if (u.startsWith('//')) u = `https:${u}`;
  if (u.startsWith('http://')) u = `https://${u.slice(7)}`;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return null;
    return unwrapPipedImageProxy(parsed.toString());
  } catch {
    return null;
  }
}

function isCoverHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h.includes('ytimg.com') ||
      h.includes('ggpht.com') ||
      h.includes('googleusercontent.com') ||
      h.includes('piped') ||
      h.endsWith('.private.coffee') ||
      (url.includes('/api/artists') && url.includes('u='))
    );
  } catch {
    return false;
  }
}

function proxyUrl(remote: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin) return null;
  // Folded into /api/artists (Hobby 12-fn limit — no separate /api/img)
  if (remote.includes('/api/artists?') && remote.includes('u=')) return remote;
  return `${window.location.origin}/api/artists?u=${encodeURIComponent(remote)}`;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function pruneIfNeeded(cache: Cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const drop = keys.length - MAX_ENTRIES;
    for (let i = 0; i < drop; i++) {
      await cache.delete(keys[i]);
    }
  } catch {
    // ignore
  }
}

function rememberBlob(remote: string, blob: Blob): string {
  const prev = memory.get(remote);
  if (prev?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      // ignore
    }
  }
  const uri = URL.createObjectURL(blob);
  memory.set(remote, uri);
  return uri;
}

async function putDisk(cache: Cache | null, key: string, blob: Blob) {
  if (!cache) return;
  try {
    const headers = new Headers({
      'Content-Type': blob.type || 'image/jpeg',
      'Content-Length': String(blob.size),
    });
    await cache.put(key, new Response(blob, { status: 200, headers }));
    void pruneIfNeeded(cache);
  } catch {
    // quota
  }
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 200) return null;
    const type = blob.type || '';
    if (type && !type.startsWith('image/') && !type.includes('octet-stream')) return null;
    return type ? blob : new Blob([blob], { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

/**
 * Resolve a cover to a local blob: URL (instant next paint / offline-ish).
 */
export async function resolveCachedCover(remote: string | null | undefined): Promise<string | null> {
  const normalized = normalizeCoverUrl(remote);
  if (!normalized) return null;
  if (normalized.startsWith('blob:') || normalized.startsWith('data:')) return normalized;

  const hit = memory.get(normalized);
  if (hit) return hit;

  const pending = inflight.get(normalized);
  if (pending) return pending;

  const job = (async (): Promise<string> => {
    const cache = await openCache();
    if (cache) {
      try {
        const match = (await cache.match(normalized)) || (await cache.match(proxyUrl(normalized) || ''));
        if (match && match.ok) {
          const blob = await match.blob();
          if (blob.size > 200) return rememberBlob(normalized, blob);
        }
      } catch {
        // ignore
      }
    }

    // 1) Direct CDN (ytimg has CORS *)
    let blob: Blob | null = null;
    if (isCoverHost(normalized)) {
      blob = await fetchBlob(normalized);
    }

    // 2) Same-origin proxy — always works for ggpht artist avatars
    if (!blob) {
      const via = proxyUrl(normalized);
      if (via) blob = await fetchBlob(via);
    }

    if (!blob) return normalized;

    await putDisk(cache, normalized, blob);
    return rememberBlob(normalized, blob);
  })().finally(() => {
    inflight.delete(normalized);
  });

  inflight.set(normalized, job);
  return job;
}

/** Sync peek — only memory (blob already hydrated this session). */
export function peekCachedCover(remote: string | null | undefined): string | null {
  const n = normalizeCoverUrl(remote);
  if (!n) return null;
  return memory.get(n) || null;
}

function acquire(): Promise<void> {
  if (running < CONCURRENCY) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      running += 1;
      resolve();
    });
  });
}

function release() {
  running = Math.max(0, running - 1);
  const next = waiters.shift();
  if (next) next();
}

function enqueue(url: string) {
  if (!url || queued.has(url) || memory.has(url)) return;
  queued.add(url);
  void (async () => {
    await acquire();
    try {
      await resolveCachedCover(url);
    } catch {
      queued.delete(url);
    } finally {
      release();
    }
  })();
}

/**
 * Demus ImagePrefetcher — warm covers into disk without blocking UI.
 * Pass any mix of track thumbs / artist avatars / playlist covers.
 */
export function prefetchCovers(
  uris: Array<string | null | undefined>,
  size: 'sm' | 'md' | 'lg' = 'md'
): void {
  if (typeof window === 'undefined') return;
  for (const raw of uris) {
    const normalized = normalizeCoverUrl(raw);
    if (!normalized) continue;
    // Video thumbs → size-optimized; channel avatars (ggpht) stay as-is
    const url = normalized.includes('/vi/')
      ? optimizeThumbUrl(normalized, size) || normalized
      : normalized;
    enqueue(url);
  }
}

export function prefetchTrackCovers(
  tracks: Array<{ thumbnail?: string | null } | null | undefined>,
  size: 'sm' | 'md' | 'lg' = 'md'
): void {
  prefetchCovers(
    tracks.map((t) => t?.thumbnail),
    size
  );
}

export function prefetchArtistCovers(
  artists: Array<{ image?: string | null; thumb?: string | null } | null | undefined>,
  size: 'sm' | 'md' | 'lg' = 'md'
): void {
  prefetchCovers(
    artists.map((a) => a?.image || a?.thumb),
    size
  );
}

/** Boot warm: tracks + artists + playlist cover URIs. */
export function warmAllCovers(input: {
  tracks?: Array<{ thumbnail?: string | null } | null | undefined>;
  artists?: Array<{ image?: string | null; thumb?: string | null } | null | undefined>;
  uris?: Array<string | null | undefined>;
}): void {
  if (input.tracks?.length) prefetchTrackCovers(input.tracks, 'md');
  if (input.artists?.length) prefetchArtistCovers(input.artists, 'md');
  if (input.uris?.length) prefetchCovers(input.uris, 'md');
}
