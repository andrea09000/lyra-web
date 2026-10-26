import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Playlist, TasteArtist, Track } from '@/types/music';
import {
  clearLibraryData,
  loadLibrary,
  markLibraryMetaRefreshed,
  resetAppData,
  saveFavorites,
  savePlaylists,
  saveRecent,
  saveTastes,
  setOnboardingDone,
  shouldRefreshLibraryMeta,
  toggleFavorite,
  upsertRecent,
} from '@/services/storage';
import {
  clearAllDownloads,
  DownloadedTrack,
  listDownloads,
  rememberLocalUri,
  removeDownload,
  saveTrackToDevice,
  warmLibraryAudio,
} from '@/services/downloads';
import { warmAllCovers } from '@/services/coverCache';
import { getTracksByIds, prefetchAudioStream } from '@/services/youtube';
import { Colors } from '@/constants/theme';

type LibraryContextValue = {
  ready: boolean;
  onboardingDone: boolean;
  favorites: Track[];
  recent: Track[];
  playlists: Playlist[];
  tastes: TasteArtist[];
  downloads: DownloadedTrack[];
  isFavorite: (id: string) => boolean;
  isDownloaded: (id: string) => boolean;
  saveDownload: (track: Track) => Promise<void>;
  deleteDownload: (id: string) => Promise<void>;
  completeOnboarding: (selected?: TasteArtist[]) => Promise<void>;
  setTastes: (artists: TasteArtist[]) => Promise<void>;
  clearLibrary: () => Promise<void>;
  resetApp: () => Promise<void>;
  addRecent: (track: Track) => Promise<void>;
  toggleFav: (track: Track) => Promise<void>;
  createPlaylist: (name: string, track?: Track) => Promise<Playlist>;
  createPlaylistWithTracks: (name: string, tracks: Track[], description?: string) => Promise<Playlist>;
  importLibraryBackup: (
    backup: {
      favorites: Track[];
      playlists: Playlist[];
      tastes: TasteArtist[];
      recent?: Track[];
    },
    mode: 'merge' | 'replace'
  ) => Promise<{ favoritesAdded: number; playlistsAdded: number; tastesAdded: number }>;
  updatePlaylist: (
    playlistId: string,
    patch: Partial<Pick<Playlist, 'name' | 'coverUri' | 'backgroundUri' | 'coverColor' | 'description'>>
  ) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  getPlaylistTracks: (playlist: Playlist) => Track[];
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

const COVER_COLORS = [
  Colors.green,
  Colors.greenDeep,
  Colors.greenSoft,
  '#E8A070',
  '#12140F',
];

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboardingDone, setOnboardingDoneState] = useState(false);
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tastes, setTastesState] = useState<TasteArtist[]>([]);
  const [downloads, setDownloads] = useState<DownloadedTrack[]>([]);
  const [trackIndex, setTrackIndex] = useState<Record<string, Track>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let index: Record<string, Track> = {};
      try {
        const [data, saved] = await Promise.all([loadLibrary(), listDownloads()]);
        if (cancelled) return;
        setFavorites(data.favorites);
        setRecent(data.recent);
        setPlaylists(data.playlists);
        setTastesState(data.tastes);
        setOnboardingDoneState(data.onboardingDone);
        setDownloads(saved);
        if (data.tastes.length) {
          void import('@/services/tasteEngine').then(({ seedTastesFromArtists }) =>
            seedTastesFromArtists(data.tastes)
          );
        }
        for (const d of saved) {
          if (d.localUri) rememberLocalUri(d.id, d.localUri);
        }
        [...data.favorites, ...data.recent, ...saved].forEach((t) => {
          index[t.id] = t;
        });
        data.playlists.forEach((p) => {
          (p.tracks ?? []).forEach((t) => {
            index[t.id] = t;
          });
        });
        setTrackIndex(index);

        // Ascoltati prima → poi preferiti → playlist (prossimo tap istantaneo)
        const toWarm: Track[] = [];
        const seen = new Set<string>();
        const push = (t: Track | undefined) => {
          if (!t?.id || seen.has(t.id)) return;
          seen.add(t.id);
          toWarm.push(t);
        };
        data.recent.forEach(push);
        data.favorites.forEach(push);
        data.playlists.forEach((p) => (p.tracks ?? []).forEach(push));
        for (const t of toWarm.slice(0, 50)) prefetchAudioStream(t.id);
        warmLibraryAudio(toWarm.slice(0, 50));
        warmAllCovers({
          tracks: toWarm.slice(0, 60),
          artists: data.tastes,
          uris: data.playlists.map((p) => p.coverUri || p.tracks?.[0]?.thumbnail),
        });
      } catch {
        // corrupt storage — boot empty
      } finally {
        if (!cancelled) setReady(true);
      }

      if (cancelled || !(await shouldRefreshLibraryMeta())) return;
      const ids = Object.keys(index);
      if (!ids.length) return;
      try {
        const fresh = await getTracksByIds(ids);
        if (cancelled || !fresh.length) return;
        const map = new Map(fresh.map((t) => [t.id, t]));
        const merge = (t: Track) => map.get(t.id) ?? t;

        setFavorites((prev) => {
          const next = prev.map(merge);
          void saveFavorites(next);
          return next;
        });
        setRecent((prev) => {
          const next = prev.map(merge);
          void saveRecent(next);
          return next;
        });
        setPlaylists((prev) => {
          const next = prev.map((p) => {
            // Prefer existing hydrated tracks; if only trackIds exist, rebuild
            // from index/API so we never persist an empty tracks: [].
            const base =
              p.tracks && p.tracks.length > 0
                ? p.tracks
                : p.trackIds
                    .map((id) => map.get(id) ?? index[id])
                    .filter(Boolean) as Track[];
            return {
              ...p,
              tracks: base.map(merge),
            };
          });
          void savePlaylists(next);
          return next;
        });
        setTrackIndex((prev) => {
          const next = { ...prev };
          for (const t of fresh) next[t.id] = t;
          return next;
        });
        await markLibraryMetaRefreshed();
      } catch {
        // keep local snapshots
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rememberTrack = useCallback((track: Track) => {
    setTrackIndex((prev) => ({ ...prev, [track.id]: track }));
  }, []);

  const setTastes = useCallback(async (artists: TasteArtist[]) => {
    setTastesState(artists);
    warmAllCovers({ artists });
    await saveTastes(artists);
  }, []);

  const clearLibrary = useCallback(async () => {
    await clearLibraryData();
    await clearAllDownloads();
    setFavorites([]);
    setRecent([]);
    setPlaylists([]);
    setDownloads([]);
    setTrackIndex({});
  }, []);

  const resetApp = useCallback(async () => {
    await resetAppData();
    await clearAllDownloads();
    void import('@/services/tasteEngine').then(({ clearTasteProfile }) =>
      clearTasteProfile()
    );
    setFavorites([]);
    setRecent([]);
    setPlaylists([]);
    setDownloads([]);
    setTastesState([]);
    setTrackIndex({});
    setOnboardingDoneState(false);
  }, []);

  const isDownloaded = useCallback(
    (id: string) => downloads.some((t) => t.id === id),
    [downloads]
  );

  const saveDownload = useCallback(async (track: Track) => {
    const entry = await saveTrackToDevice(track);
    rememberTrack(track);
    setDownloads((prev) => [entry, ...prev.filter((t) => t.id !== track.id)]);
  }, [rememberTrack]);

  const deleteDownload = useCallback(async (id: string) => {
    await removeDownload(id);
    setDownloads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const completeOnboarding = useCallback(
    async (selected?: TasteArtist[]) => {
      if (selected) {
        await setTastes(selected);
      }
      await setOnboardingDone();
      setOnboardingDoneState(true);
    },
    [setTastes]
  );

  const addRecent = useCallback(
    async (track: Track) => {
      rememberTrack(track);
      setRecent((prev) => {
        const next = upsertRecent(prev, track);
        void saveRecent(next);
        return next;
      });
      // Ascoltata → scarica subito audio + cover in IndexedDB
      warmLibraryAudio([track]);
      void saveTrackToDevice(track).catch(() => undefined);
    },
    [rememberTrack]
  );

  const toggleFav = useCallback(
    async (track: Track) => {
      rememberTrack(track);
      setFavorites((prev) => {
        const liked = !prev.some((t) => t.id === track.id);
        const next = toggleFavorite(prev, track);
        void saveFavorites(next);
        void import('@/services/tasteEngine').then(({ recordFavorite }) =>
          recordFavorite(track, liked)
        );
        return next;
      });
    },
    [rememberTrack]
  );

  const createPlaylist = useCallback(
    async (name: string, track?: Track) => {
      const playlist: Playlist = {
        id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim() || 'Nuova playlist',
        trackIds: track ? [track.id] : [],
        tracks: track ? [track] : [],
        coverColor: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
        coverUri: track?.thumbnail,
        createdAt: Date.now(),
      };
      if (track) rememberTrack(track);
      setPlaylists((prev) => {
        const next = [playlist, ...prev];
        void savePlaylists(next);
        return next;
      });
      if (track) {
        warmLibraryAudio([track]);
        prefetchAudioStream(track.id);
      }
      return playlist;
    },
    [rememberTrack]
  );

  const createPlaylistWithTracks = useCallback(
    async (name: string, tracks: Track[], description?: string) => {
      const unique: Track[] = [];
      const seen = new Set<string>();
      for (const t of tracks) {
        if (!t?.id || seen.has(t.id)) continue;
        seen.add(t.id);
        unique.push(t);
        rememberTrack(t);
      }
      const playlist: Playlist = {
        id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim() || 'Playlist importata',
        description,
        trackIds: unique.map((t) => t.id),
        tracks: unique,
        coverColor: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
        coverUri: unique[0]?.thumbnail,
        createdAt: Date.now(),
      };
      setPlaylists((prev) => {
        const next = [playlist, ...prev];
        void savePlaylists(next);
        return next;
      });
      // Import playlist → cache audio in background
      warmLibraryAudio(unique.slice(0, 40));
      for (const t of unique.slice(0, 12)) prefetchAudioStream(t.id);
      return playlist;
    },
    [rememberTrack]
  );

  const importLibraryBackup = useCallback(
    async (
      backup: {
        favorites: Track[];
        playlists: Playlist[];
        tastes: TasteArtist[];
        recent?: Track[];
      },
      mode: 'merge' | 'replace'
    ) => {
      let favoritesAdded = 0;
      let playlistsAdded = 0;
      let tastesAdded = 0;

      if (mode === 'replace') {
        const nextFav = backup.favorites;
        const nextPl = backup.playlists.map((p) => ({
          ...p,
          id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }));
        const nextTastes = backup.tastes;
        const nextRecent = (backup.recent || []).slice(0, 40);
        setFavorites(nextFav);
        setPlaylists(nextPl);
        setTastesState(nextTastes);
        setRecent(nextRecent);
        void saveFavorites(nextFav);
        void savePlaylists(nextPl);
        void saveTastes(nextTastes);
        void saveRecent(nextRecent);
        const index: Record<string, Track> = {};
        [...nextFav, ...nextRecent].forEach((t) => {
          index[t.id] = t;
        });
        nextPl.forEach((p) => (p.tracks ?? []).forEach((t) => {
          index[t.id] = t;
        }));
        setTrackIndex((prev) => ({ ...prev, ...index }));
        return {
          favoritesAdded: nextFav.length,
          playlistsAdded: nextPl.length,
          tastesAdded: nextTastes.length,
        };
      }

      const favIds = new Set(favorites.map((t) => t.id));
      const addFav = backup.favorites.filter((t) => t.id && !favIds.has(t.id));
      favoritesAdded = addFav.length;
      const nextFav = [...addFav, ...favorites];
      setFavorites(nextFav);
      void saveFavorites(nextFav);

      const names = new Set(playlists.map((p) => p.name.toLowerCase()));
      const addPl = backup.playlists.map((p) => ({
        ...p,
        id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: names.has(p.name.toLowerCase()) ? `${p.name} (import)` : p.name,
      }));
      playlistsAdded = addPl.length;
      const nextPl = [...addPl, ...playlists];
      setPlaylists(nextPl);
      void savePlaylists(nextPl);

      const tasteIds = new Set(tastes.map((t) => t.id));
      const addTastes = backup.tastes.filter((t) => t.id && !tasteIds.has(t.id));
      tastesAdded = addTastes.length;
      const nextTastes = [...tastes, ...addTastes];
      setTastesState(nextTastes);
      void saveTastes(nextTastes);

      if (backup.recent?.length) {
        const map = new Map<string, Track>();
        for (const t of [...backup.recent, ...recent]) map.set(t.id, t);
        const merged = [...map.values()].slice(0, 40);
        setRecent(merged);
        void saveRecent(merged);
      }

      const index: Record<string, Track> = {};
      backup.favorites.forEach((t) => {
        index[t.id] = t;
      });
      (backup.recent || []).forEach((t) => {
        index[t.id] = t;
      });
      backup.playlists.forEach((p) => (p.tracks ?? []).forEach((t) => {
        index[t.id] = t;
      }));
      setTrackIndex((prev) => ({ ...prev, ...index }));

      return { favoritesAdded, playlistsAdded, tastesAdded };
    },
    [favorites, playlists, recent, tastes]
  );

  const updatePlaylist = useCallback(
    async (
      playlistId: string,
      patch: Partial<Pick<Playlist, 'name' | 'coverUri' | 'backgroundUri' | 'coverColor' | 'description'>>
    ) => {
      setPlaylists((prev) => {
        const next = prev.map((p) => {
          if (p.id !== playlistId) return p;
          const name = patch.name !== undefined ? patch.name.trim() || p.name : p.name;
          return { ...p, ...patch, name };
        });
        void savePlaylists(next);
        return next;
      });
    },
    []
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, track: Track) => {
      rememberTrack(track);
      setPlaylists((prev) => {
        const next = prev.map((p) => {
          if (p.id !== playlistId || p.trackIds.includes(track.id)) return p;
          // Rebuild from trackIds when tracks is missing/empty/out of sync so
          // we never replace a full playlist with [newTrack] only.
          const prior =
            p.tracks && p.tracks.length === p.trackIds.length
              ? p.tracks
              : p.trackIds
                  .map((id) => p.tracks?.find((t) => t.id === id) ?? trackIndex[id])
                  .filter(Boolean) as Track[];
          const tracks = [...prior, track];
          return {
            ...p,
            trackIds: [...p.trackIds, track.id],
            tracks,
            coverUri: p.coverUri || track.thumbnail,
          };
        });
        void savePlaylists(next);
        return next;
      });
      // Brano in playlist → scarica già in cache
      warmLibraryAudio([track]);
      prefetchAudioStream(track.id);
    },
    [rememberTrack, trackIndex]
  );

  const removeFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    setPlaylists((prev) => {
      const next = prev.map((p) =>
        p.id === playlistId
          ? {
              ...p,
              trackIds: p.trackIds.filter((id) => id !== trackId),
              tracks: (p.tracks ?? []).filter((t) => t.id !== trackId),
            }
          : p
      );
      void savePlaylists(next);
      return next;
    });
  }, []);

  const deletePlaylist = useCallback(async (playlistId: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== playlistId);
      void savePlaylists(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((t) => t.id === id),
    [favorites]
  );

  const getPlaylistTracks = useCallback(
    (playlist: Playlist) => {
      if (playlist.tracks?.length && playlist.tracks.length >= playlist.trackIds.length) {
        return playlist.tracks;
      }
      // Prefer trackIds + index when tracks is partial/empty (legacy / meta wipe)
      const fromIds = playlist.trackIds
        .map((id) => playlist.tracks?.find((t) => t.id === id) ?? trackIndex[id])
        .filter(Boolean) as Track[];
      return fromIds.length ? fromIds : playlist.tracks ?? [];
    },
    [trackIndex]
  );

  const value = useMemo(
    () => ({
      ready,
      onboardingDone,
      favorites,
      recent,
      playlists,
      tastes,
      downloads,
      isFavorite,
      isDownloaded,
      saveDownload,
      deleteDownload,
      completeOnboarding,
      setTastes,
      clearLibrary,
      resetApp,
      addRecent,
      toggleFav,
      createPlaylist,
      createPlaylistWithTracks,
      importLibraryBackup,
      updatePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      deletePlaylist,
      getPlaylistTracks,
    }),
    [
      ready,
      onboardingDone,
      favorites,
      recent,
      playlists,
      tastes,
      downloads,
      isFavorite,
      isDownloaded,
      saveDownload,
      deleteDownload,
      completeOnboarding,
      setTastes,
      clearLibrary,
      resetApp,
      addRecent,
      toggleFav,
      createPlaylist,
      createPlaylistWithTracks,
      importLibraryBackup,
      updatePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      deletePlaylist,
      getPlaylistTracks,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
