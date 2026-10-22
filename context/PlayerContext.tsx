import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

/** Mix with calls / other audio instead of stopping cold. */
async function applyCallFriendlyAudioMode() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    // Lets Lyra keep (or resume) audio alongside phone/VoIP when the OS allows it
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });
}
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { Track } from '@/types/music';
import { useLibrary } from '@/context/LibraryContext';
import { getAudioStreamUrl, peekCachedStreamUrl, prefetchAudioStream } from '@/services/youtube';
import { getLocalAudioUri, peekLocalAudioUri, rememberLocalUri } from '@/services/downloads';

type PlayEngine = 'stream' | 'embed';

export type PlayOptions = {
  radio?: boolean;
};

type PlayerContextValue = {
  current: Track | null;
  queue: Track[];
  playing: boolean;
  loading: boolean;
  error: string | null;
  shuffle: boolean;
  repeat: boolean;
  position: number;
  duration: number;
  engine: PlayEngine;
  playTrack: (track: Track, queue?: Track[], opts?: PlayOptions) => void;
  radioActive: boolean;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  seekTo: (seconds: number) => void;
  clear: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

const STREAM_URL_MS = 1600;
const STREAM_READY_MS = 1400;
/** Tiny public video — keeps the YouTube iframe API warm before first tap. */
const WARM_VIDEO_ID = 'jNQXAC9IVRw';

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function waitForStreamReady(
  player: AudioPlayer,
  ms: number,
  /** Local files: isLoaded is enough — don't wait on duration. */
  localFile = false
): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      try {
        if (player.playing) {
          resolve(true);
          return;
        }
        if (localFile && player.isLoaded) {
          resolve(true);
          return;
        }
        if (player.isLoaded && (player.duration > 0 || player.currentTime > 0.05)) {
          resolve(true);
          return;
        }
      } catch {
        // ignore
      }
      if (Date.now() - started >= ms) {
        resolve(false);
        return;
      }
      setTimeout(tick, localFile ? 40 : 80);
    };
    tick();
  });
}

const STREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: '*/*',
  Referer: 'https://www.youtube.com/',
  Origin: 'https://www.youtube.com',
};

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { addRecent, downloads, favorites, recent, tastes } = useLibrary();

  // Keep local URI map hot for any files already on disk (no new auto-downloads)
  useEffect(() => {
    for (const d of downloads) {
      if (d.localUri) rememberLocalUri(d.id, d.localUri);
    }
  }, [downloads]);

  const playerRef = useRef<AudioPlayer | null>(null);
  const ytRef = useRef<YoutubeIframeRef>(null);
  const loadToken = useRef(0);
  const currentRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef(false);
  const engineRef = useRef<PlayEngine>('embed');
  const playNextRef = useRef<() => void>(() => undefined);
  const streamWatchRef = useRef<((status: AudioStatus) => void) | null>(null);
  /** User intent: keep playing across call interruptions when possible. */
  const wantPlayingRef = useRef(false);
  /** Position saved on pause so resume continues, not restart. */
  const pausedAtRef = useRef(0);
  const positionRef = useRef(0);
  const streamUpgradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [engine, setEngine] = useState<PlayEngine>('embed');
  const [embedId, setEmbedId] = useState<string | null>(null);
  /**
   * Keep WebView mounted after first use — cold YouTube iframe = 10–30s.
   * Soft-stop with play=false/mute; hard-unmount only if audio keeps leaking.
   */
  const [ytMounted, setYtMounted] = useState(true);
  const [embedPlay, setEmbedPlay] = useState(false);
  /** Mirrored intent for UI/timers (wantPlayingRef is the source of truth for race checks). */
  const [wantPlaying, setWantPlaying] = useState(false);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    void applyCallFriendlyAudioMode();

    const player = createAudioPlayer(null, {
      updateInterval: 200,
      keepAudioSessionActive: true,
    });
    player.volume = 1;
    player.muted = false;
    playerRef.current = player;

    const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      streamWatchRef.current?.(status);
      if (engineRef.current !== 'stream') return;
      if (!wantPlayingRef.current) {
        if (status.playing) {
          try {
            player.pause();
          } catch {
            // ignore
          }
        }
        return;
      }
      if (status.error) {
        setError('Stream interrotto');
        // Fall back to embed so playback does not sit broken on a dead stream
        const track = currentRef.current;
        if (track && wantPlayingRef.current) {
          engineRef.current = 'embed';
          setEngine('embed');
          try {
            player.pause();
            player.muted = true;
            player.volume = 0;
          } catch {
            // ignore
          }
          setYtMounted(true);
          setEmbedId(track.id);
          setEmbedPlay(true);
          setPlaying(true);
          setLoading(false);
          setError(null);
        }
        return;
      }
      setPlaying(status.playing);
      const t = status.currentTime ?? 0;
      setPosition(t);
      positionRef.current = t;
      if (status.duration && status.duration > 0) setDuration(status.duration);
      if (status.didJustFinish) playNextRef.current();
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && state !== 'background') return;
      void (async () => {
        await applyCallFriendlyAudioMode();
        if (!wantPlayingRef.current || !currentRef.current) return;
        if (engineRef.current === 'embed') {
          setYtMounted(true);
          setEmbedId(currentRef.current.id);
          setEmbedPlay(true);
          setPlaying(true);
          return;
        }
        const p = playerRef.current;
        if (!p) return;
        try {
          p.volume = 1;
          p.muted = false;
          p.play();
          setPlaying(true);
        } catch {
          setEngine('embed');
          engineRef.current = 'embed';
          setYtMounted(true);
          setEmbedId(currentRef.current.id);
          setEmbedPlay(true);
          setPlaying(true);
        }
      })();
    });

    return () => {
      appSub.remove();
      sub.remove();
      try {
        player.clearLockScreenControls();
      } catch {
        // ignore
      }
      player.remove();
      playerRef.current = null;
    };
  }, []);

  // Live clock while YouTube embed is supposed to be playing
  useEffect(() => {
    if (engine !== 'embed' || !embedId || !wantPlaying || !ytMounted) return;
    const tick = () => {
      void ytRef.current?.getCurrentTime().then((t) => {
        if (typeof t !== 'number' || !wantPlayingRef.current) return;
        setPosition(t);
        positionRef.current = t;
      });
      void ytRef.current?.getDuration().then((d) => {
        if (typeof d === 'number' && d > 0) setDuration(d);
      });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [engine, embedId, wantPlaying, ytMounted]);

  const activateLockScreen = useCallback((track: Track) => {
    const player = playerRef.current;
    if (!player || engineRef.current !== 'stream') return;
    try {
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        albumTitle: 'Lyra',
        artworkUrl: track.thumbnail,
      });
    } catch {
      // ignore
    }
  }, []);

  const prefetchUpcoming = useCallback((track: Track) => {
    const q = queueRef.current;
    const idx = q.findIndex((t) => t.id === track.id);
    // Only warm stream URL cache — never download full files here (kills first-play speed)
    const upcoming = idx >= 0 ? q.slice(idx + 1, idx + 3) : q.slice(0, 2);
    for (const next of upcoming) {
      prefetchAudioStream(next.id);
    }
  }, []);

  /** Hard stop: park iframe on warm stub (keeps WebView process alive). */
  const killEmbedAudio = useCallback(() => {
    setEmbedPlay(false);
    setEmbedId(null);
    setYtMounted(true);
  }, []);

  /** Soft stop: keep WebView warm for the next track (much faster). */
  const silenceEmbedKeepWarm = useCallback(() => {
    setEmbedPlay(false);
  }, []);

  const startEmbed = useCallback((track: Track) => {
    try {
      playerRef.current?.pause();
    } catch {
      // ignore
    }
    wantPlayingRef.current = true;
    setWantPlaying(true);
    setEngine('embed');
    engineRef.current = 'embed';
    setYtMounted(true);
    setEmbedId(track.id);
    setEmbedPlay(true);
    setPlaying(true);
    setLoading(true);
    setError(null);
  }, []);

  const playUri = useCallback(
    async (
      track: Track,
      uri: string,
      token: number,
      readyMs = STREAM_READY_MS,
      localFile = false
    ) => {
      const player = playerRef.current;
      if (!player) return false;
      if (token !== loadToken.current || !wantPlayingRef.current) return false;
      try {
        player.volume = 1;
        player.muted = false;
        player.replace(uri.startsWith('http') ? { uri, headers: STREAM_HEADERS } : { uri });
        player.play();

        // Local files: mark playing immediately — don't wait on duration metadata
        if (localFile) {
          silenceEmbedKeepWarm();
          setEngine('stream');
          engineRef.current = 'stream';
          activateLockScreen(track);
          setPlaying(true);
          setWantPlaying(true);
          wantPlayingRef.current = true;
          setLoading(false);
          setError(null);
          const ready = await waitForStreamReady(player, readyMs, true);
          if (token !== loadToken.current || !wantPlayingRef.current) {
            try {
              player.pause();
              player.muted = true;
              player.volume = 0;
            } catch {
              // ignore
            }
            return false;
          }
          if (!ready) {
            try {
              player.pause();
            } catch {
              // ignore
            }
            return false;
          }
          player.play();
          return true;
        }

        const ready = await waitForStreamReady(player, readyMs, false);
        if (token !== loadToken.current || !wantPlayingRef.current) {
          try {
            player.pause();
            player.muted = true;
            player.volume = 0;
          } catch {
            // ignore
          }
          return false;
        }
        if (!ready) {
          try {
            player.pause();
          } catch {
            // ignore
          }
          return false;
        }
        // Keep WebView mounted (muted) so the next song starts faster
        silenceEmbedKeepWarm();
        setEngine('stream');
        engineRef.current = 'stream';
        activateLockScreen(track);
        player.play();
        setPlaying(true);
        setWantPlaying(true);
        wantPlayingRef.current = true;
        setLoading(false);
        setError(null);
        return true;
      } catch {
        return false;
      }
    },
    [activateLockScreen, silenceEmbedKeepWarm]
  );

  const loadAndPlay = useCallback(
    async (track: Track) => {
      const token = ++loadToken.current;
      streamWatchRef.current = null;
      wantPlayingRef.current = true;
      setWantPlaying(true);
      pausedAtRef.current = 0;

      if (streamUpgradeTimerRef.current) clearTimeout(streamUpgradeTimerRef.current);

      // Reset engine so leftover 'stream' from the previous track cannot block
      // embed start / background upgrade for this load.
      engineRef.current = 'embed';
      setEngine('embed');
      try {
        const prev = playerRef.current;
        if (prev) {
          prev.pause();
          prev.muted = true;
          prev.volume = 0;
        }
      } catch {
        // ignore
      }

      setError(null);
      setPosition(0);
      positionRef.current = 0;
      setDuration(track.duration || 0);
      setLoading(true);
      void applyCallFriendlyAudioMode();

      // 1) Saved file → instant
      const memLocal = peekLocalAudioUri(track.id);
      if (memLocal) {
        setLoading(false);
        setPlaying(true);
        const ok = await playUri(track, memLocal, token, 500, true);
        if (token !== loadToken.current) return;
        if (ok) {
          prefetchUpcoming(track);
          return;
        }
      }

      // 2) Cached stream URL → play immediately (no WebView wait)
      const cachedUrl = peekCachedStreamUrl(track.id);
      if (cachedUrl) {
        setPlaying(true);
        const ok = await playUri(track, cachedUrl, token, 1200, false);
        if (token !== loadToken.current) return;
        if (ok) {
          prefetchUpcoming(track);
          return;
        }
      }

      // 3) Sound NOW via embed, stream upgrades in background (no wait before audio)
      let embedStarted = false;
      const ensureEmbed = () => {
        if (embedStarted || token !== loadToken.current || !wantPlayingRef.current) return;
        if (engineRef.current === 'stream') return;
        embedStarted = true;
        startEmbed(track);
      };
      ensureEmbed();

      void getLocalAudioUri(track.id).then(async (localUri) => {
        if (!localUri || token !== loadToken.current || !wantPlayingRef.current) return;
        if (engineRef.current === 'stream') return;
        await playUri(track, localUri, token, 400, true);
      });

      // Background upgrade — never blocks embed from starting
      void (async () => {
        try {
          const url = await withDeadline(getAudioStreamUrl(track.id), STREAM_URL_MS);
          if (token !== loadToken.current || !wantPlayingRef.current) return;
          if (engineRef.current === 'stream') return;
          const ok = await playUri(track, url, token, STREAM_READY_MS, false);
          if (ok) prefetchUpcoming(track);
        } catch {
          // keep embed
        }
      })();

      prefetchUpcoming(track);
    },
    [playUri, prefetchUpcoming, startEmbed]
  );

  const [radioActive, setRadioActive] = useState(true);
  const radioModeRef = useRef(true);
  const radioFillingRef = useRef(false);

  const fillRadio = useCallback(async (seed: Track) => {
    if (!radioModeRef.current || radioFillingRef.current) return;
    radioFillingRef.current = true;
    try {
      const { buildRadioQueue } = await import('@/services/tasteEngine');
      const exclude = new Set(queueRef.current.map((t) => t.id));
      exclude.add(seed.id);
      const more = await buildRadioQueue({
        seed,
        excludeIds: exclude,
        favorites,
        recent,
        tastes,
        limit: 20,
      });
      if (!more.length || !radioModeRef.current) return;
      const q = queueRef.current;
      const known = new Set(q.map((t) => t.id));
      const fresh = more.filter((t) => !known.has(t.id));
      if (!fresh.length) return;
      const nextQ = [...q, ...fresh];
      queueRef.current = nextQ;
      setQueue(nextQ);
    } catch {
      // best-effort
    } finally {
      radioFillingRef.current = false;
    }
  }, [favorites, recent, tastes]);

  const playTrack = useCallback(
    (track: Track, nextQueue?: Track[], opts?: PlayOptions) => {
      const radio = opts?.radio !== false;
      radioModeRef.current = radio;
      setRadioActive(radio);
      currentRef.current = track;
      setCurrent(track);
      setPosition(0);
      if (!radio && nextQueue && nextQueue.length > 0) {
        queueRef.current = nextQueue;
        setQueue(nextQueue);
      } else if (radio) {
        queueRef.current = [track];
        setQueue([track]);
        void fillRadio(track);
      } else {
        const without = queueRef.current.filter((t) => t.id !== track.id);
        const nextQ = [track, ...without];
        queueRef.current = nextQ;
        setQueue(nextQ);
      }
      void addRecent(track);
      void loadAndPlay(track);
    },
    [addRecent, fillRadio, loadAndPlay]
  );

  const playNext = useCallback(() => {
    const cur = currentRef.current;
    const q = queueRef.current;
    if (!cur || q.length === 0) return;

    if (shuffleRef.current) {
      const others = q.filter((t) => t.id !== cur.id);
      if (others.length === 0) {
        if (repeatRef.current) void loadAndPlay(cur);
        else {
          wantPlayingRef.current = false;
          setWantPlaying(false);
          setPlaying(false);
          killEmbedAudio();
          playerRef.current?.pause();
        }
        return;
      }
      const next = others[Math.floor(Math.random() * others.length)];
      setCurrent(next);
      void addRecent(next);
      void loadAndPlay(next);
      return;
    }

    const idx = q.findIndex((t) => t.id === cur.id);
    if (idx < 0) {
      // Current not in queue — stop rather than jumping to q[0]
      wantPlayingRef.current = false;
      setWantPlaying(false);
      setPlaying(false);
      killEmbedAudio();
      playerRef.current?.pause();
      return;
    }
    const nextIdx = idx + 1;
    if (nextIdx < q.length) {
      const next = q[nextIdx];
      currentRef.current = next;
      setCurrent(next);
      void addRecent(next);
      void loadAndPlay(next);
    } else if (repeatRef.current && q[0]) {
      currentRef.current = q[0];
      setCurrent(q[0]);
      void addRecent(q[0]);
      void loadAndPlay(q[0]);
    } else if (radioModeRef.current) {
      void fillRadio(cur).then(() => {
        const q2 = queueRef.current;
        const i2 = q2.findIndex((t) => t.id === cur.id);
        if (i2 >= 0 && i2 + 1 < q2.length) {
          const next = q2[i2 + 1];
          currentRef.current = next;
          setCurrent(next);
          void addRecent(next);
          void loadAndPlay(next);
          return;
        }
        wantPlayingRef.current = false;
        setWantPlaying(false);
        setPlaying(false);
        killEmbedAudio();
        playerRef.current?.pause();
      });
    } else {
      wantPlayingRef.current = false;
      setWantPlaying(false);
      setPlaying(false);
      killEmbedAudio();
      playerRef.current?.pause();
    }
  }, [addRecent, fillRadio, killEmbedAudio, loadAndPlay]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const playPrev = useCallback(() => {
    const cur = currentRef.current;
    const q = queueRef.current;
    if (!cur || q.length === 0) return;

    const t =
      engineRef.current === 'stream'
        ? playerRef.current?.currentTime ?? positionRef.current
        : positionRef.current;
    if (t > 3) {
      // Restart current track from 0 (same as Spotify prev behavior)
      pausedAtRef.current = 0;
      setPosition(0);
      positionRef.current = 0;
      // Always seek the active engine — including while paused — so resume
      // does not continue from the old mid-track position.
      if (engineRef.current === 'stream') {
        try {
          void playerRef.current?.seekTo(0);
        } catch {
          // ignore
        }
      } else {
        ytRef.current?.seekTo(0, true);
      }
      return;
    }

    const idx = q.findIndex((x) => x.id === cur.id);
    const prev = q[idx <= 0 ? 0 : idx - 1];
    currentRef.current = prev;
    setCurrent(prev);
    void addRecent(prev);
    void loadAndPlay(prev);
  }, [addRecent, loadAndPlay]);

  const pausePlayback = useCallback(() => {
    // Cancel pending stream upgrades so audio doesn't restart after pause
    if (streamUpgradeTimerRef.current) clearTimeout(streamUpgradeTimerRef.current);
    streamUpgradeTimerRef.current = null;

    const streamPos = playerRef.current?.currentTime;
    pausedAtRef.current =
      engineRef.current === 'stream' && typeof streamPos === 'number' && streamPos > 0
        ? streamPos
        : positionRef.current;

    wantPlayingRef.current = false;
    setWantPlaying(false);
    setPlaying(false);
    setLoading(false);

    try {
      const player = playerRef.current;
      if (player) {
        player.pause();
        player.muted = true;
        player.volume = 0;
      }
    } catch {
      // ignore
    }

    // Soft-stop first (WebView stays warm). onChangeState hard-kills if audio leaks.
    setEmbedPlay(false);
  }, []);

  const resumePlayback = useCallback(() => {
    const cur = currentRef.current;
    if (!cur) return;

    wantPlayingRef.current = true;
    setWantPlaying(true);
    setError(null);
    void applyCallFriendlyAudioMode().then(() => {
      if (!wantPlayingRef.current || !currentRef.current) return;

      const track = currentRef.current;
      const resumeAt = pausedAtRef.current;
      setPosition(resumeAt);
      positionRef.current = resumeAt;

      const startEmbedAt = () => {
        engineRef.current = 'embed';
        setEngine('embed');
        setYtMounted(true);
        setEmbedId(track.id);
        setEmbedPlay(true);
        setPlaying(true);
        setLoading(true);
      };

      if (engineRef.current === 'stream' && playerRef.current?.isLoaded) {
        const player = playerRef.current;
        try {
          activateLockScreen(track);
          player.muted = false;
          player.volume = 1;
          // Always seek after an explicit restart (resumeAt === 0) or mid-track resume
          void player.seekTo(resumeAt);
          player.play();
          setPlaying(true);
          setLoading(false);
          return;
        } catch {
          startEmbedAt();
          return;
        }
      }

      startEmbedAt();
    });
  }, [activateLockScreen]);

  const togglePlay = useCallback(() => {
    if (!currentRef.current) return;
    if (wantPlayingRef.current) pausePlayback();
    else resumePlayback();
  }, [pausePlayback, resumePlayback]);

  const seekTo = useCallback(
    (seconds: number) => {
      const max =
        duration > 0
          ? duration
          : currentRef.current?.duration && currentRef.current.duration > 0
            ? currentRef.current.duration
            : Number.POSITIVE_INFINITY;
      const t = Math.max(0, Math.min(seconds, Number.isFinite(max) ? max : seconds));
      setPosition(t);
      positionRef.current = t;

      if (!wantPlayingRef.current) {
        // Paused: store for resume; YT is unmounted
        pausedAtRef.current = t;
        return;
      }

      // Playing: apply seek now, don't re-trigger resume seek logic
      pausedAtRef.current = 0;

      if (engineRef.current === 'embed') {
        if (ytMounted && embedId) ytRef.current?.seekTo(t, true);
        return;
      }
      try {
        void playerRef.current?.seekTo(t);
      } catch {
        // ignore
      }
    },
    [duration, ytMounted, embedId]
  );

  const clear = useCallback(() => {
    loadToken.current += 1;
    wantPlayingRef.current = false;
    setWantPlaying(false);
    pausedAtRef.current = 0;
    if (streamUpgradeTimerRef.current) clearTimeout(streamUpgradeTimerRef.current);
    playerRef.current?.pause();
    setEmbedPlay(false);
    setEmbedId(null);
    setYtMounted(true);
    try {
      playerRef.current?.clearLockScreenControls();
    } catch {
      // ignore
    }
    setCurrent(null);
    setPlaying(false);
    setLoading(false);
    setError(null);
    setQueue([]);
    setPosition(0);
    setDuration(0);
  }, []);

  const value = useMemo(
    () => ({
      current,
      queue,
      playing,
      loading,
      error,
      shuffle,
      repeat,
      position,
      duration,
      engine,
      playTrack,
      radioActive,
      togglePlay,
      playNext,
      playPrev,
      toggleShuffle: () => setShuffle((s) => !s),
      toggleRepeat: () => setRepeat((r) => !r),
      seekTo,
      clear,
    }),
    [
      current,
      queue,
      playing,
      loading,
      error,
      shuffle,
      repeat,
      position,
      duration,
      engine,
      playTrack,
      radioActive,
      togglePlay,
      playNext,
      playPrev,
      seekTo,
      clear,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Always mounted (warm stub when idle) — cold iframe is the ~30s delay */}
      <View style={styles.hidden} pointerEvents="none" collapsable={false}>
        {ytMounted ? (
          <YoutubePlayer
            ref={ytRef}
            height={220}
            width={300}
            videoId={embedId || WARM_VIDEO_ID}
            play={Boolean(embedId) && embedPlay && wantPlaying}
            mute={!embedId || !embedPlay || !wantPlaying}
            forceAndroidAutoplay
            volume={embedId && embedPlay && wantPlaying ? 100 : 0}
            onChangeState={(state: string) => {
              if (!embedId) return;
              if (engineRef.current !== 'embed') return;
              if (!wantPlayingRef.current) {
                setEmbedPlay(false);
                setPlaying(false);
                // iframe ignored play=false → park on warm stub (keeps process alive)
                if (state === 'playing' || state === 'buffering') {
                  killEmbedAudio();
                }
                return;
              }
              if (state === 'ended') {
                pausedAtRef.current = 0;
                playNextRef.current();
                return;
              }
              if (state === 'playing') {
                setPlaying(true);
                setWantPlaying(true);
                setLoading(false);
                setError(null);
                const resumeAt = pausedAtRef.current;
                if (resumeAt > 0.5) {
                  ytRef.current?.seekTo(resumeAt, true);
                  pausedAtRef.current = 0;
                }
                return;
              }
              if (state === 'buffering' && wantPlayingRef.current) setLoading(true);
            }}
            onReady={() => {
              if (!embedId) {
                setEmbedPlay(false);
                return;
              }
              if (engineRef.current === 'embed' && wantPlayingRef.current) {
                setEmbedPlay(true);
                setPlaying(true);
                const resumeAt = pausedAtRef.current;
                if (resumeAt > 0.5) {
                  ytRef.current?.seekTo(resumeAt, true);
                  setTimeout(() => {
                    pausedAtRef.current = 0;
                  }, 600);
                } else {
                  setLoading(false);
                }
              } else {
                setEmbedPlay(false);
              }
            }}
            onError={() => {
              if (engineRef.current === 'embed' && embedId && wantPlayingRef.current) {
                setError('Riproduzione non disponibile');
                setLoading(false);
                setPlaying(false);
              }
            }}
            initialPlayerParams={{
              controls: false,
              modestbranding: true,
              rel: false,
              preventFullScreen: true,
              ...(pausedAtRef.current > 1
                ? { start: Math.floor(pausedAtRef.current) }
                : {}),
            }}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
              androidLayerType: 'hardware',
            }}
          />
        ) : null}
      </View>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    // Full-size WebView parked just under the screen — tiny/opacity-0 views go silent on iOS
    left: 0,
    bottom: -240,
    width: 300,
    height: 220,
    opacity: 1,
    zIndex: -1,
  },
});
