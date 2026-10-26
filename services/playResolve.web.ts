/**
 * Shared /api/play resolve cache — ytify-style streamCache (memory + sessionStorage).
 * Prefetch on search → tap skips re-resolve.
 */

export type PlayResolve = { url: string; proxy: string; mode: string; go?: string };

const cache = new Map<string, { value: PlayResolve; expires: number }>();
const inflight = new Map<string, Promise<PlayResolve>>();
const TTL = 12 * 60 * 1000;
const SS_PREFIX = 'vybe-stream_';

function sameOriginProxy(trackId: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin || !trackId) return null;
  return `${window.location.origin}/api/audio/${encodeURIComponent(trackId)}`;
}

function isDirectUrl(url: string | undefined): boolean {
  return Boolean(url) && !url!.includes('/api/audio/') && !url!.includes('/api/go/');
}

function readSession(trackId: string): PlayResolve | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + trackId);
    if (!raw) return null;
    const value = JSON.parse(raw) as PlayResolve;
    // Never resurrect go/proxy stubs — they look like success but aren't CDN URLs
    if (!isDirectUrl(value?.url)) {
      sessionStorage.removeItem(SS_PREFIX + trackId);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function writeSession(trackId: string, value: PlayResolve) {
  if (!isDirectUrl(value.url)) return;
  try {
    sessionStorage.setItem(SS_PREFIX + trackId, JSON.stringify(value));
  } catch {
    // quota — ignore
  }
}

export function peekPlayResolve(trackId: string): PlayResolve | null {
  const hit = cache.get(trackId);
  if (hit && hit.expires > Date.now()) {
    if (!isDirectUrl(hit.value.url)) {
      cache.delete(trackId);
      return null;
    }
    return hit.value;
  }

  const fromSs = readSession(trackId);
  if (fromSs) {
    cache.set(trackId, { value: fromSs, expires: Date.now() + TTL });
    return fromSs;
  }
  return null;
}

function remember(trackId: string, value: PlayResolve) {
  if (!isDirectUrl(value.url)) return;
  cache.set(trackId, { value, expires: Date.now() + TTL });
  writeSession(trackId, value);
}

/** Drop stale / dead CDN resolves so the next play re-fetches. */
export function forgetPlayResolve(trackId: string): void {
  if (!trackId) return;
  cache.delete(trackId);
  inflight.delete(trackId);
  try {
    sessionStorage.removeItem(SS_PREFIX + trackId);
  } catch {
    // ignore
  }
}

export async function resolvePlayUrl(trackId: string, ms = 3500): Promise<PlayResolve | null> {
  const proxy = sameOriginProxy(trackId);
  if (!proxy) return null;

  const hit = peekPlayResolve(trackId);
  if (hit) return hit;

  const pending = inflight.get(trackId);
  if (pending) return pending;

  const job = (async (): Promise<PlayResolve> => {
    try {
      const res = await fetch(
        `${window.location.origin}/api/play/${encodeURIComponent(trackId)}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(ms) }
      );
      if (!res.ok) return { url: proxy, proxy, mode: 'proxy' };
      const data = (await res.json()) as {
        url?: string;
        proxy?: string;
        mode?: string;
        go?: string;
      };
      const value: PlayResolve = {
        url: data.url || proxy,
        proxy: data.proxy || proxy,
        mode: data.mode || 'proxy',
        go: data.go,
      };
      remember(trackId, value);
      return value;
    } catch {
      return { url: proxy, proxy, mode: 'proxy' };
    } finally {
      inflight.delete(trackId);
    }
  })();

  inflight.set(trackId, job);
  return job;
}

/** Fire-and-forget warm of /api/play for top search hits. */
export function prefetchPlayResolve(trackId: string): void {
  if (!trackId) return;
  if (peekPlayResolve(trackId)) return;
  if (inflight.has(trackId)) return;
  void resolvePlayUrl(trackId, 3500);
}
