import { Playlist, TasteArtist, Track } from '@/types/music';

export const LYRA_BACKUP_VERSION = 1;

export type LyraBackup = {
  /** `lyra` kept for older exports */
  app: 'vybe' | 'lyra';
  version: number;
  exportedAt: number;
  favorites: Track[];
  playlists: Playlist[];
  tastes: TasteArtist[];
  recent?: Track[];
};

export type ImportMergeMode = 'merge' | 'replace';

export type ImportResult = {
  favoritesAdded: number;
  playlistsAdded: number;
  tastesAdded: number;
  tracksResolved: number;
};

function isTrack(v: unknown): v is Track {
  if (!v || typeof v !== 'object') return false;
  const t = v as Track;
  return Boolean(t.id && t.title && typeof t.id === 'string');
}

function normalizeTrack(raw: unknown): Track | null {
  if (!isTrack(raw)) return null;
  return {
    id: String(raw.id).trim(),
    title: String(raw.title || 'Unknown').trim(),
    artist: String(raw.artist || 'YouTube').trim(),
    thumbnail:
      String(raw.thumbnail || '').trim() ||
      `https://i.ytimg.com/vi/${raw.id}/mqdefault.jpg`,
    duration: Number(raw.duration) || 0,
    viewCount: raw.viewCount,
  };
}

function normalizePlaylist(raw: unknown, coverColor: string): Playlist | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Playlist;
  const name = String(p.name || '').trim();
  if (!name) return null;
  const tracks = (Array.isArray(p.tracks) ? p.tracks : [])
    .map(normalizeTrack)
    .filter((t): t is Track => Boolean(t));
  const trackIds =
    tracks.length > 0
      ? tracks.map((t) => t.id)
      : (Array.isArray(p.trackIds) ? p.trackIds : []).map(String).filter(Boolean);
  return {
    id: String(p.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    name,
    description: p.description ? String(p.description) : undefined,
    trackIds,
    tracks: tracks.length ? tracks : undefined,
    coverColor: String(p.coverColor || coverColor),
    coverUri: p.coverUri ? String(p.coverUri) : tracks[0]?.thumbnail,
    backgroundUri: p.backgroundUri ? String(p.backgroundUri) : undefined,
    createdAt: Number(p.createdAt) || Date.now(),
  };
}

function normalizeTaste(raw: unknown): TasteArtist | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as TasteArtist;
  const name = String(a.name || '').trim();
  if (!name) return null;
  return {
    id: String(a.id || `art_${name.toLowerCase().replace(/\s+/g, '_')}`),
    name,
    query: String(a.query || name),
    image: String(a.image || ''),
    color: String(a.color || '#7CFF6B'),
  };
}

/** Build a portable Vybe backup object (accepts legacy Lyra imports). */
export function buildLyraBackup(input: {
  favorites: Track[];
  playlists: Playlist[];
  tastes: TasteArtist[];
  recent?: Track[];
}): LyraBackup {
  return {
    app: 'vybe',
    version: LYRA_BACKUP_VERSION,
    exportedAt: Date.now(),
    favorites: input.favorites,
    playlists: input.playlists,
    tastes: input.tastes,
    recent: input.recent?.slice(0, 40),
  };
}

export function parseLyraBackup(raw: string | unknown): LyraBackup {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') throw new Error('File non valido');

  const obj = data as Record<string, unknown>;
  // Accept Vybe / legacy Lyra backups and loose { favorites, playlists }
  const favorites = (Array.isArray(obj.favorites) ? obj.favorites : [])
    .map(normalizeTrack)
    .filter((t): t is Track => Boolean(t));
  const playlists = (Array.isArray(obj.playlists) ? obj.playlists : [])
    .map((p, i) => normalizePlaylist(p, COVER_FALLBACK[i % COVER_FALLBACK.length]))
    .filter((p): p is Playlist => Boolean(p));
  const tastes = (Array.isArray(obj.tastes) ? obj.tastes : [])
    .map(normalizeTaste)
    .filter((t): t is TasteArtist => Boolean(t));
  const recent = (Array.isArray(obj.recent) ? obj.recent : [])
    .map(normalizeTrack)
    .filter((t): t is Track => Boolean(t));

  if (!favorites.length && !playlists.length && !tastes.length) {
    throw new Error('Nessun preferito, playlist o gusto nel file');
  }

  return {
    app: obj.app === 'lyra' ? 'lyra' : 'vybe',
    version: Number(obj.version) || LYRA_BACKUP_VERSION,
    exportedAt: Number(obj.exportedAt) || Date.now(),
    favorites,
    playlists,
    tastes,
    recent,
  };
}

const COVER_FALLBACK = ['#7CFF6B', '#3D8B40', '#A8E6A0', '#E8A070', '#12140F'];

/** Extract playlist id from youtube.com / music.youtube.com / youtu.be links. */
export function extractYoutubePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^PL[\w-]{10,}$/i.test(s) || /^OLAK5uy_[\w-]+$/i.test(s) || /^UU[\w-]{20,}$/i.test(s)) {
    return s;
  }
  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`);
    const list = url.searchParams.get('list');
    if (list) return list;
  } catch {
    // not a URL
  }
  const m = s.match(/[?&]list=([\w-]+)/i);
  return m?.[1] || null;
}

/** Parse "Artist - Title" / "Title" lines from pasted text. */
export function parseTextTrackList(text: string): { query: string; label: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[\).\-\s]+/, '').trim())
    .filter((l) => l.length > 2 && !l.startsWith('#'));

  const out: { query: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(0, 80)) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ query: `${line} official audio`, label: line });
  }
  return out;
}

export function downloadJsonFile(filename: string, data: unknown): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function pickJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Non disponibile'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('Nessun file'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Lettura file fallita'));
      reader.readAsText(file);
    };
    input.click();
  });
}
