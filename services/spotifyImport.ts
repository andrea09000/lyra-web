import { Track } from '@/types/music';
import { searchTracks } from '@/services/youtube';

export type SpotifySong = {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  spotifyId?: string;
};

export type SpotifyPlaylistPayload = {
  id: string;
  type: string;
  title: string;
  author: string;
  songs: SpotifySong[];
  total: number;
  source?: string;
  error?: string;
  needsConfig?: boolean;
};

export function looksLikeSpotifyLink(input: string): boolean {
  const s = input.trim().toLowerCase();
  return (
    s.includes('open.spotify.com') ||
    s.includes('spotify.com/playlist') ||
    s.startsWith('spotify:') ||
    /^[a-zA-Z0-9]{22}$/.test(input.trim())
  );
}

export async function fetchSpotifyPlaylist(url: string): Promise<SpotifyPlaylistPayload> {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const res = await fetch(`${origin}/api/spotify?url=${encodeURIComponent(url.trim())}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  const data = (await res.json()) as SpotifyPlaylistPayload;
  const rawErr = data.error || `Spotify ${res.status}`;
  // Never surface Spotify developer "Premium required" — we don't use that API
  const err = /premium/i.test(rawErr)
    ? 'Playlist non leggibile. Su Spotify aprila → ⋯ → Rendi pubblica, poi ricopia il link e riprova.'
    : rawErr;
  if (!res.ok) {
    throw new Error(err);
  }
  if (!data.songs?.length) {
    throw new Error(err || 'Playlist vuota o privata');
  }
  return data;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(track: Track, song: SpotifySong): number {
  const title = norm(song.title);
  const artist = norm(song.artist.split(',')[0] || song.artist);
  const hayTitle = norm(track.title);
  const hayArtist = norm(track.artist);
  const hay = `${hayTitle} ${hayArtist}`;

  let score = 0;
  if (hayTitle === title) score += 6;
  else if (hayTitle.includes(title) || title.includes(hayTitle)) score += 4;
  else {
    const words = title.split(' ').filter((w) => w.length > 2);
    const hits = words.filter((w) => hayTitle.includes(w)).length;
    if (words.length) score += (hits / words.length) * 3;
  }

  if (hayArtist.includes(artist) || artist.includes(hayArtist)) score += 3;
  else if (hay.includes(artist)) score += 2;

  // Prefer official / audio results lightly
  if (/official|audio|lyric/i.test(track.title)) score += 0.5;
  return score;
}

export async function matchSongToYoutube(song: SpotifySong): Promise<Track | null> {
  const q = `${song.artist} ${song.title}`;
  const results = await searchTracks(q, 8);
  if (!results.length) {
    const fallback = await searchTracks(`${song.title} ${song.artist} official audio`, 6);
    if (!fallback.length) return null;
    return pickBest(fallback, song);
  }
  return pickBest(results, song);
}

function pickBest(results: Track[], song: SpotifySong): Track | null {
  let best: Track | null = null;
  let bestScore = 0;
  for (const t of results) {
    const s = scoreMatch(t, song);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  // Require a minimum similarity so we don't import random videos
  if (bestScore < 3.5) return null;
  return best;
}

export type MatchProgress = {
  done: number;
  total: number;
  matched: number;
  current?: string;
};

/** Match Spotify songs → YouTube tracks with limited concurrency. */
export async function matchSpotifySongs(
  songs: SpotifySong[],
  onProgress?: (p: MatchProgress) => void,
  concurrency = 3
): Promise<{ tracks: Track[]; missed: SpotifySong[] }> {
  const tracks: Track[] = [];
  const missed: SpotifySong[] = [];
  const seen = new Set<string>();
  let done = 0;
  let matched = 0;
  let idx = 0;

  async function worker() {
    while (idx < songs.length) {
      const i = idx++;
      const song = songs[i];
      onProgress?.({
        done,
        total: songs.length,
        matched,
        current: `${song.artist} — ${song.title}`,
      });
      try {
        const track = await matchSongToYoutube(song);
        if (track && !seen.has(track.id)) {
          seen.add(track.id);
          tracks.push(track);
          matched++;
        } else if (!track) {
          missed.push(song);
        }
      } catch {
        missed.push(song);
      }
      done++;
      onProgress?.({ done, total: songs.length, matched, current: `${song.artist} — ${song.title}` });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, songs.length) }, () => worker());
  await Promise.all(workers);
  return { tracks, missed };
}
