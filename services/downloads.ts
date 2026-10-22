import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Track } from '@/types/music';
import { getAudioStreamUrl } from '@/services/youtube';

const META_KEY = '@lyra/downloads';
const DIR = `${FileSystem.documentDirectory ?? ''}lyra-audio/`;
const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}lyra-play-cache/`;
/** Cap so auto-save does not fill the phone. Oldest (LRU) are removed first. */
const MAX_DOWNLOADS = 60;

export type DownloadedTrack = Track & {
  localUri: string;
  savedAt: number;
};

const STREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: '*/*',
  Referer: 'https://www.youtube.com/',
  Origin: 'https://www.youtube.com',
};

let metaCache: DownloadedTrack[] | null = null;
const inflight = new Map<string, Promise<string>>();

async function ensureDir(path: string) {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
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

function filePath(videoId: string, root: string) {
  return `${root}${videoId}.m4a`;
}

/** In-memory hits so play never waits on AsyncStorage/FS for known files. */
const localUriMemory = new Map<string, string>();

export function rememberLocalUri(videoId: string, uri: string) {
  localUriMemory.set(videoId, uri);
}

/** Sync path for instant play — memory + in-RAM meta, no FS wait. */
export function peekLocalAudioUri(videoId: string): string | null {
  const mem = localUriMemory.get(videoId);
  if (mem) return mem;
  const saved = metaCache?.find((t) => t.id === videoId);
  if (saved?.localUri) {
    localUriMemory.set(videoId, saved.localUri);
    return saved.localUri;
  }
  return null;
}

/** Instant local path if the track was saved or soft-cached. */
export async function getLocalAudioUri(videoId: string): Promise<string | null> {
  const mem = peekLocalAudioUri(videoId);
  if (mem) {
    try {
      const info = await FileSystem.getInfoAsync(mem);
      if (info.exists && (info.size ?? 0) > 1000) return mem;
      localUriMemory.delete(videoId);
    } catch {
      localUriMemory.delete(videoId);
    }
  }

  const downloads = await readMeta();
  const saved = downloads.find((t) => t.id === videoId);
  if (saved?.localUri) {
    const info = await FileSystem.getInfoAsync(saved.localUri);
    if (info.exists && (info.size ?? 0) > 1000) {
      localUriMemory.set(videoId, saved.localUri);
      return saved.localUri;
    }
  }

  // Known permanent path without waiting on meta miss
  const permanent = filePath(videoId, DIR);
  try {
    const info = await FileSystem.getInfoAsync(permanent);
    if (info.exists && (info.size ?? 0) > 1000) {
      localUriMemory.set(videoId, permanent);
      return permanent;
    }
  } catch {
    // ignore
  }

  const cached = filePath(videoId, CACHE_DIR);
  try {
    const info = await FileSystem.getInfoAsync(cached);
    if (info.exists && (info.size ?? 0) > 10_000) {
      localUriMemory.set(videoId, cached);
      return cached;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function listDownloads(): Promise<DownloadedTrack[]> {
  const list = await readMeta();
  const alive: DownloadedTrack[] = [];
  for (const item of list) {
    const info = await FileSystem.getInfoAsync(item.localUri);
    if (info.exists) alive.push(item);
  }
  if (alive.length !== list.length) await writeMeta(alive);
  return alive;
}

export async function isDownloaded(videoId: string): Promise<boolean> {
  const list = await readMeta();
  const hit = list.find((t) => t.id === videoId);
  if (!hit) return false;
  const info = await FileSystem.getInfoAsync(hit.localUri);
  return info.exists;
}

async function downloadTo(videoId: string, target: string): Promise<string> {
  const existing = inflight.get(`${videoId}:${target}`);
  if (existing) return existing;

  const job = (async () => {
    const dir = target.slice(0, target.lastIndexOf('/') + 1);
    await ensureDir(dir);
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists && (info.size ?? 0) > 10_000) {
      rememberLocalUri(videoId, target);
      return target;
    }

    const url = await getAudioStreamUrl(videoId);
    const result = await FileSystem.downloadAsync(url, target, { headers: STREAM_HEADERS });
    if (result.status !== 200 && result.status !== 206) {
      try {
        await FileSystem.deleteAsync(target, { idempotent: true });
      } catch {
        // ignore
      }
      throw new Error(`Download fallito (${result.status})`);
    }
    rememberLocalUri(videoId, result.uri);
    return result.uri;
  })().finally(() => {
    inflight.delete(`${videoId}:${target}`);
  });

  inflight.set(`${videoId}:${target}`, job);
  return job;
}

/** Soft cache fallback (used only if permanent save is not possible yet). */
export function cacheTrackAudio(videoId: string): void {
  if (!videoId || !FileSystem.cacheDirectory) return;
  void downloadTo(videoId, filePath(videoId, CACHE_DIR)).catch(() => undefined);
}

/** Background-warm playlist / recent / favorites (native: soft file cache). */
export function warmLibraryAudio(tracks: Track[]): void {
  for (const t of tracks) {
    if (t?.id) cacheTrackAudio(t.id);
  }
}

async function pruneOverflow(list: DownloadedTrack[]): Promise<DownloadedTrack[]> {
  if (list.length <= MAX_DOWNLOADS) return list;
  const keep = list.slice(0, MAX_DOWNLOADS);
  const drop = list.slice(MAX_DOWNLOADS);
  await Promise.all(
    drop.map((t) => FileSystem.deleteAsync(t.localUri, { idempotent: true }).catch(() => undefined))
  );
  return keep;
}

/** Permanent save on device — plays offline next time. Auto-called on every play. */
export async function saveTrackToDevice(track: Track): Promise<DownloadedTrack> {
  if (!FileSystem.documentDirectory) throw new Error('Storage non disponibile');

  const prev = await readMeta();
  const existing = prev.find((t) => t.id === track.id);
  if (existing) {
    const info = await FileSystem.getInfoAsync(existing.localUri);
    if (info.exists && (info.size ?? 0) > 10_000) {
      const entry: DownloadedTrack = {
        ...existing,
        ...track,
        localUri: existing.localUri,
        savedAt: Date.now(),
      };
      const next = await pruneOverflow([entry, ...prev.filter((t) => t.id !== track.id)]);
      await writeMeta(next);
      rememberLocalUri(track.id, entry.localUri);
      return entry;
    }
  }

  const uri = await downloadTo(track.id, filePath(track.id, DIR));
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
  const hit = prev.find((t) => t.id === videoId);
  if (hit) {
    try {
      await FileSystem.deleteAsync(hit.localUri, { idempotent: true });
    } catch {
      // ignore
    }
  }
  await writeMeta(prev.filter((t) => t.id !== videoId));
}

export async function clearAllDownloads(): Promise<void> {
  const prev = await readMeta();
  await Promise.all(
    prev.map((t) => FileSystem.deleteAsync(t.localUri, { idempotent: true }).catch(() => undefined))
  );
  await writeMeta([]);
}
