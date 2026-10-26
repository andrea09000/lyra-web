import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '@/types/music';
import { prefetchTrackCovers } from '@/services/coverCache';
import { scrapeAudioCandidates } from '@/services/ytScrape.web';

const META_KEY = '@lyra/downloads-web';
const DB_NAME = 'lyra-audio';
const STORE = 'blobs';
const CACHE_NAME = 'lyra-audio-blobs-v1';
/** Cap so auto-cache does not fill the phone. Oldest (LRU) removed first. */
const MAX_DOWNLOADS = 80;
const MIN_BYTES = 10_000;
const CONCURRENCY = 4;

export type DownloadedTrack = Track & {
  localUri: string;
  savedAt: number;
};

let metaCache: DownloadedTrack[] | null = null;
const localUriMemory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const warmQueued = new Set<string>();
let warmRunning = 0;
const warmWait: Array<() => void> = [];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

async function idbGet(videoId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(videoId);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v instanceof Blob ? v : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(videoId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, videoId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(videoId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

async function cacheApiPut(videoId: string, blob: Blob): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const headers = new Headers({
      'Content-Type': blob.type || 'audio/mp4',
      'Content-Length': String(blob.size),
    });
    await cache.put(
      `/__lyra_audio__/${encodeURIComponent(videoId)}`,
      new Response(blob, { status: 200, headers })
    );
  } catch {
    // Safari private mode / quota
  }
}

async function cacheApiDelete(videoId: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(`/__lyra_audio__/${encodeURIComponent(videoId)}`);
  } catch {
    // ignore
  }
}

function blobUri(videoId: string, blob: Blob): string {
  const prev = localUriMemory.get(videoId);
  if (prev?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      // ignore
    }
  }
  const uri = URL.createObjectURL(blob);
  localUriMemory.set(videoId, uri);
  return uri;
}

async function readMeta(): Promise<DownloadedTrack[]> {
  if (metaCache) return metaCache;
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    metaCache = raw ? (JSON.parse(raw) as DownloadedTrack[]) : [];
  } catch {
    metaCache = [];
  }
  return metaCache;
}

async function writeMeta(list: DownloadedTrack[]) {
  metaCache = list;
  await AsyncStorage.setItem(META_KEY, JSON.stringify(list));
}

export function rememberLocalUri(videoId: string, uri: string) {
  localUriMemory.set(videoId, uri);
}

export function peekLocalAudioUri(videoId: string): string | null {
  const mem = localUriMemory.get(videoId);
  if (mem) return mem;
  const saved = metaCache?.find((t) => t.id === videoId);
  // blob: URIs from a previous session are dead — only return live memory hits
  if (saved?.localUri && !saved.localUri.startsWith('blob:')) {
    localUriMemory.set(videoId, saved.localUri);
    return saved.localUri;
  }
  return null;
}

async function hydrateBlobUri(videoId: string): Promise<string | null> {
  const blob = await idbGet(videoId);
  if (!blob || blob.size < MIN_BYTES) return null;
  return blobUri(videoId, blob);
}

export async function getLocalAudioUri(videoId: string): Promise<string | null> {
  const mem = peekLocalAudioUri(videoId);
  if (mem) return mem;
  return hydrateBlobUri(videoId);
}

export async function listDownloads(): Promise<DownloadedTrack[]> {
  const list = await readMeta();
  const alive: DownloadedTrack[] = [];
  for (const item of list) {
    const blob = await idbGet(item.id);
    if (blob && blob.size >= MIN_BYTES) {
      const uri = blobUri(item.id, blob);
      alive.push({ ...item, localUri: uri });
    }
  }
  if (alive.length !== list.length) await writeMeta(alive);
  return alive;
}

export async function isDownloaded(videoId: string): Promise<boolean> {
  if (peekLocalAudioUri(videoId)) return true;
  const blob = await idbGet(videoId);
  return Boolean(blob && blob.size >= MIN_BYTES);
}

async function fetchPlayableBlob(videoId: string): Promise<Blob> {
  const candidates = await scrapeAudioCandidates(videoId);
  // Top bitrate first among CORS-friendly mirrors; skip /api/audio (Range-chunked)
  const norm = (b?: number) => {
    const n = Number(b || 0);
    return n > 0 && n < 2000 ? n * 1000 : n;
  };
  // Inv videoplayback often lacks CORS for fetch() (media <audio> is fine).
  // Prefer same-origin /api/audio for offline download blobs.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const proxy = origin ? `${origin}/api/audio/${encodeURIComponent(videoId)}` : null;
  const ranked = [
    ...(proxy ? [{ url: proxy, source: 'proxy:audio', mime: 'audio/mp4' as string | undefined }] : []),
    ...candidates
      .filter((c) => !c.url.includes('googlevideo.com') && !c.url.includes('/videoplayback'))
      .sort((a, b) => norm(b.bitrate) - norm(a.bitrate)),
  ];

  let lastError: unknown;
  for (const c of ranked.slice(0, 4)) {
    try {
      const res = await fetch(c.url, {
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const blob = await res.blob();
      if (blob.size < MIN_BYTES) {
        lastError = new Error('too small');
        continue;
      }
      const type = blob.type || c.mime || 'audio/mp4';
      return type && type !== blob.type ? new Blob([blob], { type }) : blob;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Download fallito');
}

async function pruneOverflow(list: DownloadedTrack[]): Promise<DownloadedTrack[]> {
  if (list.length <= MAX_DOWNLOADS) return list;
  const keep = list.slice(0, MAX_DOWNLOADS);
  const drop = list.slice(MAX_DOWNLOADS);
  await Promise.all(
    drop.map(async (t) => {
      const uri = localUriMemory.get(t.id);
      if (uri?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(uri);
        } catch {
          // ignore
        }
      }
      localUriMemory.delete(t.id);
      await idbDelete(t.id);
      await cacheApiDelete(t.id);
    })
  );
  return keep;
}

async function downloadTo(videoId: string): Promise<string> {
  const existing = inflight.get(videoId);
  if (existing) return existing;

  const job = (async () => {
    const mem = peekLocalAudioUri(videoId);
    if (mem) return mem;

    const cached = await hydrateBlobUri(videoId);
    if (cached) return cached;

    const blob = await fetchPlayableBlob(videoId);
    await idbPut(videoId, blob);
    void cacheApiPut(videoId, blob);
    return blobUri(videoId, blob);
  })().finally(() => {
    inflight.delete(videoId);
  });

  inflight.set(videoId, job);
  return job;
}

/** Soft cache — fire-and-forget after play / playlist warm. */
export function cacheTrackAudio(videoId: string): void {
  if (!videoId || typeof indexedDB === 'undefined') return;
  void downloadTo(videoId).catch(() => undefined);
}

/** Permanent cache entry (playlist / listened / manual save). */
export async function saveTrackToDevice(track: Track): Promise<DownloadedTrack> {
  prefetchTrackCovers([track], 'lg');
  const uri = await downloadTo(track.id);
  const prev = await readMeta();
  const entry: DownloadedTrack = {
    ...track,
    localUri: uri,
    savedAt: Date.now(),
  };
  const next = await pruneOverflow([entry, ...prev.filter((t) => t.id !== track.id)]);
  await writeMeta(next);
  rememberLocalUri(track.id, uri);
  return entry;
}

export async function removeDownload(videoId: string): Promise<void> {
  const prev = await readMeta();
  const uri = localUriMemory.get(videoId);
  if (uri?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(uri);
    } catch {
      // ignore
    }
  }
  localUriMemory.delete(videoId);
  await idbDelete(videoId);
  await cacheApiDelete(videoId);
  await writeMeta(prev.filter((t) => t.id !== videoId));
}

export async function clearAllDownloads(): Promise<void> {
  const prev = await readMeta();
  for (const t of prev) {
    const uri = localUriMemory.get(t.id);
    if (uri?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(uri);
      } catch {
        // ignore
      }
    }
    localUriMemory.delete(t.id);
    await idbDelete(t.id);
    await cacheApiDelete(t.id);
  }
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // ignore
    }
  }
  await writeMeta([]);
}

function acquireWarmSlot(): Promise<void> {
  if (warmRunning < CONCURRENCY) {
    warmRunning += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    warmWait.push(() => {
      warmRunning += 1;
      resolve();
    });
  });
}

function releaseWarmSlot() {
  warmRunning = Math.max(0, warmRunning - 1);
  const next = warmWait.shift();
  if (next) next();
}

/**
 * Background-queue ascoltati / preferiti / playlist → IndexedDB audio.
 * Dedupes, rate-limits, never blocks UI. Already-cached tracks still refresh meta.
 */
export function warmLibraryAudio(tracks: Track[]): void {
  prefetchTrackCovers(tracks, 'md');
  if (typeof indexedDB === 'undefined') return;
  for (const track of tracks) {
    if (!track?.id || warmQueued.has(track.id)) continue;
    // Already in memory this session — still ensure meta entry exists
    if (peekLocalAudioUri(track.id)) {
      warmQueued.add(track.id);
      void saveTrackToDevice(track).catch(() => undefined);
      continue;
    }
    warmQueued.add(track.id);
    void (async () => {
      await acquireWarmSlot();
      try {
        await saveTrackToDevice(track);
      } catch {
        // scrape/CORS miss — allow a later warm pass to retry
        warmQueued.delete(track.id);
      } finally {
        releaseWarmSlot();
      }
    })();
  }
}
