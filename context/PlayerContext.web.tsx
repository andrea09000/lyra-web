import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Track } from '@/types/music';
import { useLibrary } from '@/context/LibraryContext';
import {
  bindKeepAlive,
  createBackgroundAudioElement,
  unlockWebAudio,
} from '@/services/backgroundAudio.web';
import { prefetchAudioStream, prefetchPlayResolve, warmAudioProxy } from '@/services/youtube';
import {
  cacheTrackAudio,
  getLocalAudioUri,
  peekLocalAudioUri,
  saveTrackToDevice,
} from '@/services/downloads';
import {
  forgetScrape,
  forgetScrapeUrl,
  peekScrapeCandidates,
  peekScrapeUrl,
  rememberScrapeHit,
  scrapeAudioCandidates,
} from '@/services/ytScrape.web';
import { buildRadioQueue, recordListen } from '@/services/tasteEngine';
import { peekPlayResolve, resolvePlayUrl } from '@/services/playResolve.web';
import {
  audioErrorHandler,
  cacheRemove as ytifyCacheRemove,
  getStreamData,
  ytifyPlay,
} from '@/services/ytifyCore.web';
import { proxyHandler } from '@/services/ytifyStream.web';
import { prefetchTrackCovers } from '@/services/coverCache';

export type PlayOptions = {
  /** false = stick to playlist/mood list; true (default) = personalized radio after this track */
  radio?: boolean;
};

/**
 * ytify-style player: only HTML5 <audio> + Media Session.
 * No YouTube iframe — that's what lets iOS keep playing in background.
 */

type PlayEngine = 'stream';

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
  /** true when auto-recommendations are filling the queue */
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

const CANDIDATE_MS = 2000;
/** Proxy should be warm from prefetch; keep budget tight so we failover fast */
const PROXY_CANDIDATE_MS = 3500;
const BLOB_CANDIDATE_MS = 400;
const DIRECT_CANDIDATE_MS = 2800;
/** YouTube adaptive streams often report a padded duration (silence after the song). */
const END_EPSILON_SEC = 0.35;
const STALL_MS = 1600;

/**
 * Prefer YouTube metadata when the media container is longer (silent padding).
 * If media is slightly shorter once loaded, trust media.
 */
function resolveDuration(metaSec: number, mediaSec: number): number {
  const meta = Number.isFinite(metaSec) && metaSec > 0 ? metaSec : 0;
  const media = Number.isFinite(mediaSec) && mediaSec > 0 ? mediaSec : 0;
  if (meta && media) {
    if (media > meta + 1.5) return meta;
    if (meta > media + 2 && media > 20) return media;
    return Math.min(meta, media);
  }
  return meta || media || 0;
}

type DecAudio = HTMLAudioElement & {
  webkitAudioDecodedByteCount?: number;
  mozAudioDecodedBytes?: number;
};

/** Chrome/Firefox expose decoded PCM bytes — 0 while "playing" = silent stream. */
function decodedAudioBytes(audio: HTMLAudioElement): number | null {
  const a = audio as DecAudio;
  if (typeof a.webkitAudioDecodedByteCount === 'number') return a.webkitAudioDecodedByteCount;
  if (typeof a.mozAudioDecodedBytes === 'number') return a.mozAudioDecodedBytes;
  return null;
}

function ensureLoud(audio: HTMLAudioElement) {
  try {
    audio.muted = false;
    if (audio.volume < 0.2) audio.volume = 1;
  } catch {
    // ignore
  }
}

function isAudible(audio: HTMLAudioElement): boolean {
  // readyState alone is not enough — /api/audio can sit at HAVE_ENOUGH_DATA with t≈0
  if (audio.error || audio.paused) return false;
  if (audio.muted || audio.volume === 0) return false;
  if (audio.readyState < 2) return false;
  if (audio.currentTime <= 0.08) return false;
  const bytes = decodedAudioBytes(audio);
  // Timeline can advance on dead/silent streams; require real decode when the API exists
  if (bytes !== null && audio.currentTime > 0.4 && bytes < 128) return false;
  return true;
}

/** Real playback with sound — do NOT replace src (causes rewind). */
function isProgressing(audio: HTMLAudioElement): boolean {
  if (audio.error) return false;
  if (audio.muted || audio.volume === 0) return false;
  // Never trust currentTime alone — silent streams still advance the seek bar
  return isAudible(audio);
}

/** True when playback is actually producing audio (not just play() / timeupdate). */
function waitUntilAudible(audio: HTMLAudioElement, ms: number): Promise<boolean> {
  ensureLoud(audio);
  if (isAudible(audio)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      audio.removeEventListener('playing', onOk);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('canplaythrough', onCanPlay);
      audio.removeEventListener('loadeddata', onCanPlay);
      audio.removeEventListener('timeupdate', onOk);
      audio.removeEventListener('error', onError);
      resolve(ok);
    };
    const good = () => {
      ensureLoud(audio);
      return isAudible(audio);
    };
    const kickPlay = () => {
      ensureLoud(audio);
      void audio.play().then(() => {
        if (good()) done(true);
      }).catch(() => undefined);
    };
    const onOk = () => {
      if (good()) done(true);
    };
    const onCanPlay = () => {
      // Safari often fires canplay while still "paused" until play() sticks
      kickPlay();
      if (good()) done(true);
    };
    const onError = () => done(false);
    // Poll decode bytes — timeupdate alone can lie on silent CDN URLs
    const poll = setInterval(() => {
      if (good()) done(true);
      else if (Date.now() - started >= ms) done(false);
    }, 200);
    const timer = setTimeout(() => done(good()), ms);
    audio.addEventListener('playing', onOk);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('canplaythrough', onCanPlay);
    audio.addEventListener('loadeddata', onCanPlay);
    audio.addEventListener('timeupdate', onOk);
    audio.addEventListener('error', onError, { once: true });
    kickPlay();
  });
}

function sameOriginProxy(trackId: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin || !trackId) return null;
  return `${window.location.origin}/api/audio/${encodeURIComponent(trackId)}`;
}

function browserNeedsMp4(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const el = document.createElement('audio');
    return !el.canPlayType('audio/webm; codecs="opus"');
  } catch {
    return true;
  }
}

function looksLikeWebmUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('mime=audio%2Fwebm') || u.includes('mime=audio/webm') || u.includes('&codec=opus');
}

function orderPlayUrls(urls: string[]): string[] {
  const direct: string[] = [];
  const proxy: string[] = [];
  const seen = new Set<string>();
  const skipWebm = browserNeedsMp4();
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (u.includes('/api/audio/') || u.includes('/api/go/')) {
      proxy.push(u);
      continue;
    }
    if (skipWebm && looksLikeWebmUrl(u)) continue;
    // ytify: raw googlevideo + inv-proxy both OK in Chrome <audio>
    direct.push(u);
  }
  // Direct CDN first (ytify), same-origin proxy last
  return [...direct.slice(0, 2), ...proxy.slice(0, 1)];
}

function setMediaHandler(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // some browsers reject seekto / seek±
  }
}

function bindMediaSession(
  track: Track | null,
  handlers: {
    play: () => void;
    pause: () => void;
    next: () => void;
    prev: () => void;
    seek: (seconds: number) => void;
  }
) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Vybe',
      artwork: track.thumbnail
        ? [
            { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
            { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
            { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
          ]
        : [],
    });
  } catch {
    // optional metadata
  }
  setMediaHandler('play', handlers.play);
  setMediaHandler('pause', handlers.pause);
  // nexttrack / previoustrack → icone skip canzone (non ±10s)
  setMediaHandler('previoustrack', handlers.prev);
  setMediaHandler('nexttrack', handlers.next);
  // Se registri seekbackward/forward il sistema mostra ±10s anche se fai skip:
  // vanno azzerati così restano solo le frecce brano precedente/successivo.
  setMediaHandler('seekbackward', null);
  setMediaHandler('seekforward', null);
  setMediaHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.seek(details.seekTime);
  });
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { addRecent, favorites, recent, tastes } = useLibrary();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Hidden element that buffers the next queue track while current plays. */
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const preloadedIdRef = useRef<string | null>(null);
  const loadToken = useRef(0);
  const currentRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef(false);
  const radioModeRef = useRef(true);
  const radioFillingRef = useRef(false);
  const listenStartedAtRef = useRef(0);
  const listenPeakRef = useRef(0);
  const playNextRef = useRef<() => void>(() => undefined);
  const loadAndPlayRef = useRef<(track: Track, token: number) => Promise<void>>(async () => undefined);
  const armPreloadRef = useRef<(track: Track | null) => void>(() => undefined);
  const fillRadioRef = useRef<(seed: Track) => Promise<void>>(async () => undefined);
  const wantPlayingRef = useRef(false);
  const switchingRef = useRef(false);
  const recoveringRef = useRef(false);
  const positionRef = useRef(0);
  const playHistoryRef = useRef<string[]>([]);
  /** Canonical song length from YouTube (seconds), not the padded stream container. */
  const metaDurationRef = useRef(0);
  const durationRef = useRef(0);
  const lastTickTimeRef = useRef(0);
  const stallSinceRef = useRef(0);
  const endingRef = useRef(false);
  /** Consecutive stream failures — stop auto-skip storms when nothing is playable. */
  const failStreakRef = useRef(0);

  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [radioActive, setRadioActive] = useState(true);

  const favoritesRef = useRef(favorites);
  const recentRef = useRef(recent);
  const tastesRef = useRef(tastes);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);
  useEffect(() => {
    recentRef.current = recent;
  }, [recent]);
  useEffect(() => {
    tastesRef.current = tastes;
  }, [tastes]);

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

  // Persistent audio element (ytify: new Audio() — we keep it in DOM for iOS)
  useEffect(() => {
    const audio = createBackgroundAudioElement();
    audioRef.current = audio;

    const preload = document.createElement('audio');
    preload.preload = 'auto';
    preload.setAttribute('playsinline', 'true');
    preload.muted = true;
    Object.assign(preload.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(preload);
    preloadRef.current = preload;

    const finishTrack = () => {
      if (endingRef.current || switchingRef.current) return;
      endingRef.current = true;
      try {
        audio.pause();
      } catch {
        // ignore
      }
      playNextRef.current();
    };

    const syncDuration = () => {
      const media = Number.isFinite(audio.duration) ? audio.duration : 0;
      const next = resolveDuration(metaDurationRef.current, media);
      if (next > 0 && Math.abs(next - durationRef.current) > 0.2) {
        durationRef.current = next;
        setDuration(next);
      }
      return next;
    };

    const onMeta = () => {
      syncDuration();
    };

    let silenceSince = 0;

    const onTime = () => {
      if (!wantPlayingRef.current) return;
      ensureLoud(audio);
      const t = audio.currentTime || 0;
      setPosition(t);
      positionRef.current = t;
      if (t > listenPeakRef.current) listenPeakRef.current = t;

      // Seek bar moving but no decoded audio → dead stream; recover like onError
      const bytes = decodedAudioBytes(audio);
      if (
        !audio.paused &&
        !switchingRef.current &&
        !recoveringRef.current &&
        t > 0.7 &&
        bytes !== null &&
        bytes < 256
      ) {
        if (!silenceSince) silenceSince = Date.now();
        else if (Date.now() - silenceSince >= 1100) {
          silenceSince = 0;
          audio.dispatchEvent(new Event('error'));
          return;
        }
      } else {
        silenceSince = 0;
      }

      const dur = syncDuration();
      const meta = metaDurationRef.current;

      // Re-arm next track buffer in the last 30% so playlist handoff is ready
      if (dur > 0 && t >= dur * 0.7) {
        const cur = currentRef.current;
        if (cur) {
          const q = queueRef.current;
          const idx = q.findIndex((x) => x.id === cur.id);
          const remaining = idx >= 0 ? q.length - idx - 1 : 0;
          if (radioModeRef.current && remaining < 3) {
            void fillRadioRef.current(cur);
          }
          const nxt =
            idx >= 0 && idx + 1 < q.length
              ? q[idx + 1]
              : shuffleRef.current
                ? null
                : repeatRef.current
                  ? q[0]
                  : null;
          if (nxt && preloadedIdRef.current !== nxt.id) {
            armPreloadRef.current(nxt);
          }
        }
      }

      // Hit YouTube length → skip silent padding at end of stream
      if (meta > 0 && t >= meta - END_EPSILON_SEC) {
        finishTrack();
        return;
      }
      // Media reports a shorter accurate length
      if (dur > 0 && t >= dur - END_EPSILON_SEC) {
        finishTrack();
        return;
      }

      // Stall / end-of-stream without a reliable `ended` (common on proxied YT audio)
      if (!audio.paused && !switchingRef.current) {
        if (Math.abs(t - lastTickTimeRef.current) < 0.04) {
          if (!stallSinceRef.current) stallSinceRef.current = Date.now();
          else if (Date.now() - stallSinceRef.current >= STALL_MS && t > 8) {
            const nearEnd = dur > 0 ? t >= dur * 0.85 : t > 30;
            if (nearEnd || audio.ended || audio.readyState >= 3) {
              finishTrack();
              return;
            }
          }
        } else {
          stallSinceRef.current = 0;
        }
      }
      lastTickTimeRef.current = t;

      if ('mediaSession' in navigator) {
        try {
          const d = dur > 0 ? dur : Number.isFinite(audio.duration) ? audio.duration : 0;
          navigator.mediaSession.setPositionState({
            duration: d > 0 ? d : Math.max(t, 1),
            playbackRate: audio.playbackRate || 1,
            position: Math.min(t, d > 0 ? d : t),
          });
        } catch {
          // ignore
        }
      }
    };
    const onPlay = () => {
      endingRef.current = false;
      stallSinceRef.current = 0;
      setPlaying(true);
      setLoading(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    };
    const onPauseUi = () => {
      if (wantPlayingRef.current) return;
      setPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };
    const onEnded = () => finishTrack();
    const onWaiting = () => {
      if (wantPlayingRef.current && audio.currentTime < 0.1) setLoading(true);
    };
    const onError = () => {
      if (!wantPlayingRef.current || switchingRef.current || recoveringRef.current) return;
      const track = currentRef.current;
      if (!track) return;

      recoveringRef.current = true;
      switchingRef.current = true;
      setError(null);

      // ytify audioErrorHandler — rewrite googlevideo → sticky Inv (exact port)
      if (audioErrorHandler(audio)) {
        window.setTimeout(() => {
          switchingRef.current = false;
          recoveringRef.current = false;
          if (isAudible(audio)) {
            setPlaying(true);
            setLoading(false);
          }
        }, 1800);
        return;
      }

      // Full retry via ytify getStreamData
      ytifyCacheRemove(track.id);
      forgetScrape(track.id);
      setLoading(true);
      const token = ++loadToken.current;
      void loadAndPlayRef
        .current(track, token)
        .finally(() => {
          recoveringRef.current = false;
          switchingRef.current = false;
        });
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPauseUi);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);

    const stopKeepAlive = bindKeepAlive(
      audio,
      () => wantPlayingRef.current && Boolean(audio.src) && !switchingRef.current
    );

    return () => {
      stopKeepAlive();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPauseUi);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
      audioRef.current = null;
      preload.pause();
      preload.removeAttribute('src');
      preload.remove();
      preloadRef.current = null;
      preloadedIdRef.current = null;
    };
  }, []);

  const resolveNextTrack = useCallback((from: Track): Track | null => {
    const q = queueRef.current;
    if (!q.length) return null;
    if (shuffleRef.current) {
      const others = q.filter((t) => t.id !== from.id);
      if (!others.length) return repeatRef.current ? from : null;
      return others[Math.floor(Math.random() * others.length)];
    }
    const idx = q.findIndex((t) => t.id === from.id);
    if (idx >= 0 && idx + 1 < q.length) return q[idx + 1];
    if (repeatRef.current && q[0]) return q[0];
    return null;
  }, []);

  const resolveReadyUrl = useCallback(async (trackId: string): Promise<string | null> => {
    const mem = peekLocalAudioUri(trackId);
    if (mem) return mem;
    const hydrated = await getLocalAudioUri(trackId);
    if (hydrated) return hydrated;
    const play = peekPlayResolve(trackId);
    if (play?.url && !play.url.includes('/api/audio/')) return play.url;
    const list = peekScrapeCandidates(trackId);
    const direct = list.find((c) => !c.url.includes('/api/audio/'));
    if (direct?.url) return direct.url;
    if (play?.url) return play.url;
    return peekScrapeUrl(trackId);
  }, []);

  const armPreload = useCallback(
    (track: Track | null) => {
      const el = preloadRef.current;
      if (!el || !track?.id) {
        preloadedIdRef.current = null;
        return;
      }
      if (preloadedIdRef.current === track.id && el.src) return;

      prefetchAudioStream(track.id);
      prefetchPlayResolve(track.id);
      warmAudioProxy(track.id);

      void (async () => {
        let url = await resolveReadyUrl(track.id);
        if (!url) {
          try {
            const [fresh, resolved] = await Promise.all([
              scrapeAudioCandidates(track.id),
              resolvePlayUrl(track.id, 8000),
            ]);
            url =
              (await getLocalAudioUri(track.id)) ||
              fresh.find((c) => !c.url.includes('/api/audio/'))?.url ||
              (resolved?.url && !resolved.url.includes('/api/audio/') ? resolved.url : null) ||
              resolved?.url ||
              fresh[0]?.url ||
              null;
          } catch {
            url = null;
          }
        }
        if (!url || !preloadRef.current) return;
        if (currentRef.current?.id === track.id) return;
        try {
          const pre = preloadRef.current;
          pre.muted = true;
          if (pre.src !== url) {
            pre.src = url;
            pre.load();
          }
          preloadedIdRef.current = track.id;
          // Force buffer without audible playback
          void pre.play().then(() => {
            pre.pause();
            pre.currentTime = 0;
          }).catch(() => undefined);
        } catch {
          // ignore
        }
      })();
    },
    [resolveReadyUrl]
  );

  useEffect(() => {
    armPreloadRef.current = armPreload;
  }, [armPreload]);

  const prefetchUpcoming = useCallback(
    (track: Track) => {
      const q = queueRef.current;
      const idx = q.findIndex((t) => t.id === track.id);
      // Warm further ahead so track 3+ isn't cold (search only pre-warms the head)
      const upcoming = idx >= 0 ? q.slice(idx + 1, idx + 8) : q.slice(0, 6);
      prefetchTrackCovers([track, ...upcoming], 'lg');
      upcoming.forEach((n, i) => {
        const delay = i * 350;
        window.setTimeout(() => {
          if (currentRef.current?.id !== track.id) return;
          prefetchAudioStream(n.id);
          prefetchPlayResolve(n.id);
          if (i < 3) warmAudioProxy(n.id);
        }, delay);
      });
      const next = upcoming[0] ?? null;
      armPreload(next);
      window.setTimeout(() => {
        if (currentRef.current?.id !== track.id) return;
        for (const n of upcoming.slice(0, 2)) cacheTrackAudio(n.id);
      }, 5000);
    },
    [armPreload]
  );

  const tryUrls = useCallback(
    async (audio: HTMLAudioElement, trackId: string, urls: string[], token: number) => {
      const ordered = orderPlayUrls(urls);
      for (const url of ordered) {
        if (token !== loadToken.current || !wantPlayingRef.current) return 'abort' as const;

        // Keep switchingRef true for the whole candidate audition so onError
        // cannot abort remaining URLs / start a conflicting loadAndPlay.
        switchingRef.current = true;
        audio.muted = false;
        audio.volume = 1;

        const local = url.startsWith('blob:') || url.startsWith('file:');
        const proxy = url.includes('/api/audio/');
        const playUrl = local || proxy ? url : proxyHandler(url);

        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // ignore
        }
        // Do NOT set currentTime before metadata — Safari aborts the load
        audio.src = playUrl;
        try {
          audio.load();
        } catch {
          // ignore
        }

        // Direct inv-proxy is usually fast; same-origin proxy may cold-start
        const budget = local ? BLOB_CANDIDATE_MS : proxy ? PROXY_CANDIDATE_MS : CANDIDATE_MS;
        const ok = await waitUntilAudible(audio, budget);
        if (token !== loadToken.current || !wantPlayingRef.current) {
          switchingRef.current = false;
          return 'abort' as const;
        }

        if (ok) {
          if (!local) rememberScrapeHit(trackId, url);
          failStreakRef.current = 0;
          setPlaying(true);
          setLoading(false);
          setError(null);
          switchingRef.current = false;
          return 'ok' as const;
        }

        forgetScrapeUrl(trackId, url);
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // ignore
        }
      }
      switchingRef.current = false;
      return 'fail' as const;
    },
    []
  );

  /** Promote pre-buffered next track onto the main element — near-instant gap fill. */
  const playFromPreload = useCallback(
    (track: Track, token: number): boolean => {
      const audio = audioRef.current;
      const pre = preloadRef.current;
      if (!audio || !pre || preloadedIdRef.current !== track.id) return false;
      const src = pre.currentSrc || pre.src;
      if (!src) return false;

      switchingRef.current = true;
      try {
        pre.pause();
      } catch {
        // ignore
      }
      audio.muted = false;
      audio.volume = 1;
      audio.src = src;
      audio.currentTime = 0;
      switchingRef.current = false;
      preloadedIdRef.current = null;
      pre.removeAttribute('src');

      void audio
        .play()
        .then(() => {
          if (token !== loadToken.current) return;
          failStreakRef.current = 0;
          setPlaying(true);
          setLoading(false);
          setError(null);
          prefetchUpcoming(track);
          void saveTrackToDevice(track).catch(() => undefined);
        })
        .catch(() => {
          if (token !== loadToken.current) return;
          void loadAndPlayRef.current(track, token);
        });
      return true;
    },
    [prefetchUpcoming]
  );

  const failTrack = useCallback((token: number) => {
    if (token !== loadToken.current) return;
    // Never auto-skip — stay on this track and let the user retry / pick another
    failStreakRef.current = 0;
    setError('Stream assente — riprova o scegli un altro brano');
    setPlaying(false);
    setLoading(false);
    wantPlayingRef.current = false;
  }, []);

  const loadAndPlay = useCallback(
    async (track: Track, token: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      setError(null);

      const proxy = sameOriginProxy(track.id);

      const onOk = () => {
        failStreakRef.current = 0;
        setPlaying(true);
        setLoading(false);
        setError(null);
        switchingRef.current = false;
        const src = audio.currentSrc || audio.src || '';
        if (src) rememberScrapeHit(track.id, src);
        prefetchUpcoming(track);
        void saveTrackToDevice(track).catch(() => undefined);
      };

      const stillMine = () => token === loadToken.current && wantPlayingRef.current;

      if (isAudible(audio)) {
        onOk();
        return;
      }

      setLoading(true);
      switchingRef.current = true;

      // 0) Local blob (already listened)
      const memLocal = peekLocalAudioUri(track.id);
      if (memLocal && !(audio.currentSrc || audio.src)) {
        const result = await tryUrls(audio, track.id, [memLocal], token);
        if (result === 'ok') {
          onOk();
          return;
        }
        if (result === 'abort') return;
      }

      if (!stillMine()) {
        if (token === loadToken.current) switchingRef.current = false;
        return;
      }

      // 1) ytify player(id): getStreamData → preferredStream → proxyHandler → play
      // (cache cleared only on error — same as ytify streamCache)
      const played = await ytifyPlay(track.id, audio);
      if (!stillMine()) {
        if (token === loadToken.current) switchingRef.current = false;
        return;
      }
      if (played.ok) {
        if (played.lengthSeconds > 0) {
          metaDurationRef.current = played.lengthSeconds;
          durationRef.current = resolveDuration(played.lengthSeconds, durationRef.current);
          setDuration(durationRef.current);
        }
        const ok = await waitUntilAudible(audio, DIRECT_CANDIDATE_MS);
        if (!stillMine()) {
          if (token === loadToken.current) switchingRef.current = false;
          return;
        }
        if (ok || isAudible(audio)) {
          onOk();
          return;
        }
        // ytify audioErrorHandler once
        if (audioErrorHandler(audio)) {
          const ok2 = await waitUntilAudible(audio, DIRECT_CANDIDATE_MS);
          if (!stillMine()) {
            if (token === loadToken.current) switchingRef.current = false;
            return;
          }
          if (ok2 || isAudible(audio)) {
            onOk();
            return;
          }
        }
      }

      // 2) Last resort: same-origin /api/audio (ytify emergency edge equivalent)
      if (proxy) {
        try {
          audio.src = `${proxy}${proxy.includes('?') ? '&' : '?'}t=${Date.now()}`;
          void audio.play().catch(() => undefined);
        } catch {
          // ignore
        }
        const ok = await waitUntilAudible(audio, PROXY_CANDIDATE_MS);
        if (!stillMine()) {
          if (token === loadToken.current) switchingRef.current = false;
          return;
        }
        if (ok || isAudible(audio)) {
          onOk();
          return;
        }
      }

      failTrack(token);
    },
    [failTrack, prefetchUpcoming, tryUrls]
  );

  useEffect(() => {
    loadAndPlayRef.current = loadAndPlay;
  }, [loadAndPlay]);

  const commitListen = useCallback((prev: Track | null, skipped: boolean) => {
    if (!prev) return;
    const listened = Math.max(listenPeakRef.current, positionRef.current);
    const dur = durationRef.current || prev.duration || 0;
    void recordListen({
      track: prev,
      listenedSeconds: listened,
      durationSeconds: dur,
      skipped,
    });
  }, []);

  const fillRadio = useCallback(async (seed: Track) => {
    if (!radioModeRef.current || radioFillingRef.current) return;
    radioFillingRef.current = true;
    try {
      const exclude = new Set(queueRef.current.map((t) => t.id));
      exclude.add(seed.id);
      const more = await buildRadioQueue({
        seed,
        excludeIds: exclude,
        favorites: favoritesRef.current,
        recent: recentRef.current,
        tastes: tastesRef.current,
        limit: 20,
      });
      if (!more.length || !radioModeRef.current) return;
      // Still on a radio session seeded from this world
      const q = queueRef.current;
      const seedIdx = q.findIndex((t) => t.id === seed.id);
      const curId = currentRef.current?.id;
      const known = new Set(q.map((t) => t.id));
      const fresh = more.filter((t) => !known.has(t.id));
      if (!fresh.length) return;
      // Append after current tail
      const nextQ = [...q, ...fresh];
      queueRef.current = nextQ;
      setQueue(nextQ);
      fresh.slice(0, 8).forEach((t, i) => {
        window.setTimeout(() => {
          prefetchAudioStream(t.id);
          prefetchPlayResolve(t.id);
          if (i < 3) warmAudioProxy(t.id);
        }, i * 400);
      });
      const cur = currentRef.current;
      if (cur) {
        const idx = nextQ.findIndex((t) => t.id === cur.id);
        const nxt = idx >= 0 && idx + 1 < nextQ.length ? nextQ[idx + 1] : null;
        if (nxt) armPreloadRef.current(nxt);
      }
      void seedIdx;
      void curId;
    } catch {
      // radio is best-effort
    } finally {
      radioFillingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fillRadioRef.current = fillRadio;
  }, [fillRadio]);

  const switchToTrack = useCallback(
    (track: Track, opts?: { queue?: Track[]; fromHistory?: boolean; skipped?: boolean }) => {
      const prev = currentRef.current;
      if (prev && prev.id !== track.id) {
        commitListen(prev, Boolean(opts?.skipped));
        if (!opts?.fromHistory) {
          playHistoryRef.current = [...playHistoryRef.current, prev.id].slice(-80);
        }
      }

      const token = ++loadToken.current;
      unlockWebAudio();
      recoveringRef.current = false;
      endingRef.current = false;
      listenStartedAtRef.current = Date.now();
      listenPeakRef.current = 0;

      if (opts?.queue && opts.queue.length > 0) {
        queueRef.current = opts.queue;
        setQueue(opts.queue);
        // Warm neighbors hard so track 3+ isn't cold when autoplay reaches them
        opts.queue.slice(0, 10).forEach((t, i) => {
          if (t.id === track.id) return;
          const delay = i < 3 ? 0 : i * 200;
          window.setTimeout(() => {
            prefetchPlayResolve(t.id);
            warmAudioProxy(t.id);
            if (i < 6) prefetchAudioStream(t.id);
          }, delay);
        });
      }

      currentRef.current = track;
      setCurrent(track);
      setPlaying(true);
      setLoading(true);
      setError(null);
      setPosition(0);
      positionRef.current = 0;
      stallSinceRef.current = 0;
      lastTickTimeRef.current = 0;
      metaDurationRef.current = track.duration > 0 ? track.duration : 0;
      durationRef.current = metaDurationRef.current;
      setDuration(metaDurationRef.current);
      wantPlayingRef.current = true;

      void addRecent(track);

      if (radioModeRef.current) {
        const q = queueRef.current;
        const idx = q.findIndex((t) => t.id === track.id);
        const remaining = idx >= 0 ? q.length - idx - 1 : 0;
        if (remaining < 4) void fillRadio(track);
      }

      // Gapless-ish: promote already-buffered next track
      if (playFromPreload(track, token)) {
        return;
      }

      // === ytify player(id) ===
      // local blob → getStreamData + preferredStream + proxyHandler (exact ytify)
      const audio = audioRef.current;
      if (audio) {
        switchingRef.current = true;
        audio.muted = false;
        audio.volume = 1;
        try {
          delete audio.dataset.retried;
        } catch {
          // ignore
        }

        const local = peekLocalAudioUri(track.id);
        if (local) {
          try {
            audio.src = local;
            void audio.play().catch(() => undefined);
          } catch {
            // ignore
          }
        }

        if (!local) {
          void getLocalAudioUri(track.id).then((uri) => {
            if (!uri || token !== loadToken.current) return;
            if (isAudible(audio)) return;
            try {
              audio.src = uri;
              void audio.play().catch(() => undefined);
            } catch {
              // ignore
            }
          });
        }

        // Primary: ytify getStreamData → applyAudioStreams (sets src + play)
        void ytifyPlay(track.id, audio).then((res) => {
          if (token !== loadToken.current || !wantPlayingRef.current) return;
          if (!res.ok) return;
          if (res.lengthSeconds > 0 && metaDurationRef.current <= 0) {
            metaDurationRef.current = res.lengthSeconds;
            setDuration(res.lengthSeconds);
          }
        });
      }

      void loadAndPlay(track, token);
    },
    [addRecent, commitListen, fillRadio, loadAndPlay, playFromPreload]
  );

  const playTrack = useCallback(
    (track: Track, nextQueue?: Track[], opts?: PlayOptions) => {
      const radio = opts?.radio !== false;
      radioModeRef.current = radio;
      setRadioActive(radio);
      // User picked a track — reset auto-skip fail streak
      failStreakRef.current = 0;

      if (!radio && nextQueue && nextQueue.length > 0) {
        switchToTrack(track, { queue: nextQueue });
        return;
      }

      // Search / home: keep nearby results as provisional queue so scrape prefetch
      // of neighbors is useful — fillRadio appends recommendations after.
      if (radio) {
        let seedQ: Track[] = [track];
        if (nextQueue?.length) {
          const idx = nextQueue.findIndex((t) => t.id === track.id);
          const from = idx >= 0 ? idx : 0;
          const neighbors = nextQueue.slice(from, from + 8);
          const seen = new Set<string>();
          seedQ = [];
          for (const t of neighbors) {
            if (seen.has(t.id)) continue;
            seen.add(t.id);
            seedQ.push(t);
          }
          if (!seedQ.some((t) => t.id === track.id)) seedQ = [track, ...seedQ];
          else {
            // Ensure tapped track is first
            seedQ = [track, ...seedQ.filter((t) => t.id !== track.id)];
          }
        }
        switchToTrack(track, { queue: seedQ });
        void fillRadio(track);
        return;
      }

      const nextQ = [track, ...queueRef.current.filter((t) => t.id !== track.id)];
      switchToTrack(track, { queue: nextQ });
    },
    [fillRadio, switchToTrack]
  );

  const playNext = useCallback(() => {
    const cur = currentRef.current;
    if (!cur || queueRef.current.length === 0) {
      endingRef.current = false;
      return;
    }
    const listened = Math.max(listenPeakRef.current, positionRef.current);
    const dur = durationRef.current || cur.duration || 0;
    const earlySkip = listened < 12 && (dur === 0 || dur > 25);
    const next = resolveNextTrack(cur);
    if (!next && radioModeRef.current) {
      void (async () => {
        await fillRadio(cur);
        const again = resolveNextTrack(cur);
        endingRef.current = false;
        if (again) {
          switchToTrack(again, { skipped: earlySkip });
          return;
        }
        wantPlayingRef.current = false;
        setPlaying(false);
        audioRef.current?.pause();
      })();
      return;
    }
    if (!next) {
      endingRef.current = false;
      wantPlayingRef.current = false;
      setPlaying(false);
      audioRef.current?.pause();
      return;
    }
    switchToTrack(next, { skipped: earlySkip });
  }, [fillRadio, resolveNextTrack, switchToTrack]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const playPrev = useCallback(() => {
    const cur = currentRef.current;
    const q = queueRef.current;
    if (!cur || q.length === 0) return;

    const t = positionRef.current;
    if (t > 3 && audioRef.current) {
      audioRef.current.currentTime = 0;
      setPosition(0);
      positionRef.current = 0;
      return;
    }

    if (shuffleRef.current && playHistoryRef.current.length) {
      const prevId = playHistoryRef.current.pop();
      const prev = prevId ? q.find((x) => x.id === prevId) : null;
      if (prev) {
        switchToTrack(prev, { fromHistory: true });
        return;
      }
    }

    const idx = q.findIndex((x) => x.id === cur.id);
    switchToTrack(q[idx <= 0 ? 0 : idx - 1], { fromHistory: true });
  }, [switchToTrack]);

  const pausePlayback = useCallback(() => {
    wantPlayingRef.current = false;
    setPlaying(false);
    setLoading(false);
    audioRef.current?.pause();
  }, []);

  const resumePlayback = useCallback(() => {
    const cur = currentRef.current;
    const audio = audioRef.current;
    if (!cur || !audio) return;
    unlockWebAudio();
    wantPlayingRef.current = true;
    setError(null);

    if (audio.src && !audio.error) {
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => switchToTrack(cur));
      return;
    }
    switchToTrack(cur);
  }, [switchToTrack]);

  const togglePlay = useCallback(() => {
    if (!currentRef.current) return;
    if (wantPlayingRef.current) pausePlayback();
    else resumePlayback();
  }, [pausePlayback, resumePlayback]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max =
      durationRef.current > 0
        ? durationRef.current
        : resolveDuration(metaDurationRef.current, Number.isFinite(audio.duration) ? audio.duration : 0);
    const t = Math.max(0, max > 0 ? Math.min(seconds, max) : seconds);
    try {
      audio.currentTime = t;
    } catch {
      // some streams reject seeks past real content
    }
    setPosition(t);
    positionRef.current = t;
    stallSinceRef.current = 0;
  }, []);

  const clear = useCallback(() => {
    loadToken.current += 1;
    wantPlayingRef.current = false;
    switchingRef.current = false;
    endingRef.current = false;
    failStreakRef.current = 0;
    playHistoryRef.current = [];
    currentRef.current = null;
    queueRef.current = [];
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setCurrent(null);
    setQueue([]);
    setPlaying(false);
    setLoading(false);
    setError(null);
    setPosition(0);
    setDuration(0);
    positionRef.current = 0;
    durationRef.current = 0;
    metaDurationRef.current = 0;
  }, []);

  // Keep going when leaving the app (ytify relies on the browser; we nudge too)
  useEffect(() => {
    const keepGoing = () => {
      if (!wantPlayingRef.current || switchingRef.current) return;
      const audio = audioRef.current;
      if (audio?.src && audio.paused && !audio.error) void audio.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', keepGoing);
    window.addEventListener('pagehide', keepGoing);
    return () => {
      document.removeEventListener('visibilitychange', keepGoing);
      window.removeEventListener('pagehide', keepGoing);
    };
  }, []);

  useEffect(() => {
    if (!current) {
      bindMediaSession(null, {
        play: () => undefined,
        pause: () => undefined,
        next: () => undefined,
        prev: () => undefined,
        seek: () => undefined,
      });
      return;
    }
    bindMediaSession(current, {
      play: () => resumePlayback(),
      pause: () => pausePlayback(),
      next: () => playNext(),
      prev: () => playPrev(),
      seek: (seconds) => seekTo(seconds),
    });
  }, [current, pausePlayback, playNext, playPrev, resumePlayback, seekTo]);

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
      engine: 'stream' as PlayEngine,
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
      clear,
      current,
      duration,
      error,
      loading,
      playNext,
      playPrev,
      playTrack,
      playing,
      position,
      queue,
      radioActive,
      repeat,
      seekTo,
      shuffle,
      togglePlay,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
