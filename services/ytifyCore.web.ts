/**
 * Port of ytify stream/player core (logic only — no UI).
 * Sources: getStreamData.ts, helpers.ts, audioErrorHandler.ts, player.ts applyAudioStreams
 */

export type YtifyAudioStream = {
  url: string;
  type?: string;
  bitrate?: string | number;
  itag?: string | number;
};

export type YtifyStreamData = {
  title?: string;
  author?: string;
  authorId?: string;
  lengthSeconds?: number;
  adaptiveFormats: YtifyAudioStream[];
  proxy: string;
  recommendedVideos?: unknown[];
};

const INSTANCES = [
  'https://yt.omada.cafe',
  'https://invidious.schenkel.eti.br',
  'https://invidious.kemonomimi.nl',
  'https://echostreamz.com',
];

const STREAM_SS = 'vybe-ytify-stream_';
const PROXY_SS = 'vybe-ytify-proxy';
const QUALITY: 'medium' = 'medium';

let stickyProxy = '';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readStickyProxy(): string {
  if (stickyProxy) return stickyProxy;
  try {
    const v = sessionStorage.getItem(PROXY_SS) || '';
    if (v && INSTANCES.includes(v)) stickyProxy = v;
  } catch {
    // ignore
  }
  return stickyProxy;
}

function writeStickyProxy(proxy: string) {
  stickyProxy = proxy || '';
  try {
    if (proxy) sessionStorage.setItem(PROXY_SS, proxy);
    else sessionStorage.removeItem(PROXY_SS);
  } catch {
    // ignore
  }
}

function cacheGet(id: string): YtifyStreamData | null {
  try {
    const raw = sessionStorage.getItem(STREAM_SS + id);
    if (!raw) return null;
    const data = JSON.parse(raw) as YtifyStreamData;
    if (!data?.adaptiveFormats?.length) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheSet(id: string, data: YtifyStreamData) {
  try {
    sessionStorage.setItem(STREAM_SS + id, JSON.stringify(data));
  } catch {
    // quota
  }
}

export function cacheRemove(id: string) {
  try {
    sessionStorage.removeItem(STREAM_SS + id);
  } catch {
    // ignore
  }
}

async function supportsOpus(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaCapabilities) {
    try {
      const el = document.createElement('audio');
      return Boolean(el.canPlayType('audio/webm; codecs="opus"'));
    } catch {
      return false;
    }
  }
  try {
    const res = await navigator.mediaCapabilities.decodingInfo({
      type: 'file',
      audio: { contentType: 'audio/webm;codecs=opus' },
    });
    return Boolean(res.supported);
  } catch {
    return false;
  }
}

/** ytify preferredStream — medium quality itags (exact itag lists) */
export async function preferredStream(audioStreams: YtifyAudioStream[]): Promise<YtifyAudioStream> {
  const preferedCodec = (await supportsOpus()) ? 'opus' : 'aac';
  const itags = {
    worst: { opus: [600, 249, 251], aac: [599, 139, 140] },
    low: { opus: [249, 600, 251], aac: [139, 599, 140] },
    medium: { opus: [250, 249, 251], aac: [139, 140] },
    high: { opus: [251], aac: [140] },
  }[QUALITY][preferedCodec];

  let stream: YtifyAudioStream | undefined;
  for (const itag of itags) {
    if (stream?.url) continue;
    const v = audioStreams.find((s) => String(s.url || '').includes(`itag=${itag}`));
    if (v) stream = v;
  }
  if (!stream?.url) {
    // fallback if itag match missed (InnerTube urls sometimes omit itag in path)
    const sorted = [...audioStreams].sort(
      (a, b) => parseInt(String(a.bitrate || '0'), 10) - parseInt(String(b.bitrate || '0'), 10)
    );
    stream = sorted[sorted.length - 1] || sorted[0];
  }
  if (!stream?.url) throw new Error('no preferred stream');
  return stream;
}

/** ytify handleXtags */
export function handleXtags(audioStreams: YtifyAudioStream[]): YtifyAudioStream[] {
  const isDRC = (url: string) => url.includes('drc%3D1') || url.includes('drc=1');
  const useDRC = Boolean(audioStreams.find((a) => isDRC(String(a.url || ''))));
  const isOriginal = (a: YtifyAudioStream) =>
    !String(a.url || '').includes('acont%3Ddubbed') && !String(a.url || '').includes('acont=dubbed');

  return audioStreams
    .filter((a) => (useDRC ? isDRC(String(a.url || '')) : !isDRC(String(a.url || ''))))
    .filter(isOriginal);
}

/**
 * ytify proxyHandler.
 * Music-first: rewrite googlevideo → sticky Inv whenever sticky exists
 * (ytify gates on "- Topic"; every Vybe track is music).
 * Pass useProxy=false for emergency /api/s (ytify sets proxy='').
 */
export function proxyHandler(url: string, useProxy = true): string {
  const proxy = readStickyProxy();
  if (!useProxy || !proxy || !url) return url;
  if (url.includes('&fallback')) return url;
  try {
    const link = new URL(url);
    const origin = link.origin;
    return url.replace(origin, proxy.replace(/\/$/, ''));
  } catch {
    // ignore
  }
  return url;
}

/**
 * ytify audioErrorHandler — rewrite failed src origin → sticky Inv.
 */
export function audioErrorHandler(audio: HTMLAudioElement): boolean {
  audio.pause();
  const proxy = readStickyProxy();
  if (!audio.src || audio.src === (typeof location !== 'undefined' ? location.href : '')) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(audio.src);
  } catch {
    return false;
  }

  const isFallback = audio.src.includes('&fallback');
  const isAlreadyProxy =
    (proxy && url.origin === new URL(proxy).origin) || audio.dataset.retried === 'true';

  if (isFallback) {
    return false;
  }

  if (!proxy || isAlreadyProxy) {
    return false;
  }

  const newSrc = audio.src.replace(url.origin, proxy.replace(/\/$/, ''));
  if (newSrc !== audio.src) {
    audio.dataset.retried = 'true';
    audio.src = newSrc;
    void audio.play().catch(() => undefined);
    return true;
  }
  return false;
}

async function fetchInvVideo(proxy: string, id: string, signal?: AbortSignal): Promise<YtifyStreamData> {
  const base = proxy.replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/videos/${id}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.adaptiveFormats)) {
    throw new Error(data?.error || 'adaptiveFormats missing');
  }
  if (!data.adaptiveFormats.some((f: { type?: string }) => String(f.type || '').startsWith('audio'))) {
    throw new Error('no audio streams');
  }
  return {
    title: data.title,
    author: data.author,
    authorId: data.authorId,
    lengthSeconds: Number(data.lengthSeconds || 0),
    adaptiveFormats: data.adaptiveFormats,
    proxy: base,
    recommendedVideos: data.recommendedVideos || [],
  };
}

/** Emergency: same-origin /api/s (ytify /s/ edge) */
async function fetchServerFallback(id: string, signal?: AbortSignal): Promise<YtifyStreamData> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!origin) throw new Error('no origin');
  const res = await fetch(`${origin}/api/s/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`api/s ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.adaptiveFormats)) {
    throw new Error(data?.error || 'adaptiveFormats missing');
  }
  const formats = (data.adaptiveFormats as YtifyAudioStream[]).filter(
    (f) => f.url && !String(f.url).includes('/api/audio/')
  );
  if (!formats.some((f) => String(f.type || '').startsWith('audio') || /audio|mp4a|opus|m4a/i.test(String(f.type || '')))) {
    // RapidAPI may use mimeType field — accept urls with itag audio
    if (!formats.length) throw new Error('no audio');
  }
  return {
    title: data.title,
    author: data.author,
    authorId: data.authorId,
    lengthSeconds: Number(data.lengthSeconds || 0),
    adaptiveFormats: formats.map((f) => ({
      ...f,
      type: f.type || 'audio/mp4',
    })),
    proxy: '', // raw / fallback URLs — proxyHandler no-ops without sticky; set from first Inv later
    recommendedVideos: data.recommendedVideos || [],
  };
}

/**
 * ytify getStreamData: sticky Inv → each instance → emergency /api/s
 */
export async function getStreamData(
  id: string,
  signal?: AbortSignal
): Promise<YtifyStreamData | { error: string; message: string }> {
  const cached = cacheGet(id);
  if (cached) {
    if (cached.proxy) writeStickyProxy(cached.proxy);
    return cached;
  }

  const instances = shuffle(INSTANCES.slice());
  const sticky = readStickyProxy();
  const order = sticky ? [sticky, ...instances.filter((i) => i !== sticky)] : instances;

  for (const proxy of order) {
    try {
      const data = await fetchInvVideo(proxy, id, signal);
      data.proxy = proxy;
      writeStickyProxy(proxy);
      cacheSet(id, data);
      return data;
    } catch {
      // next
    }
  }

  try {
    // ytify emergency: data.proxy = '' → play googlevideo direct (no forced Inv)
    const data = await fetchServerFallback(id, signal);
    data.proxy = '';
    // Keep existing sticky for audioErrorHandler rewrites if direct fails
    cacheSet(id, data);
    return data;
  } catch (e) {
    return {
      error: 'All proxies failed',
      message: String((e as Error)?.message || e),
    };
  }
}

/** ytify applyAudioStreams → set audio.src */
export async function applyAudioStreams(
  audio: HTMLAudioElement,
  adaptiveFormats: YtifyAudioStream[],
  useProxy = true
): Promise<string> {
  const audioStreams = adaptiveFormats
    .filter((f) => String(f.type || '').startsWith('audio') || String(f.url || '').includes('itag='))
    .sort((a, b) => parseInt(String(a.bitrate || '0'), 10) - parseInt(String(b.bitrate || '0'), 10));

  if (!audioStreams.length) throw new Error('no audio streams');

  const filtered = handleXtags(audioStreams);
  const stream = await preferredStream(filtered.length ? filtered : audioStreams);
  try {
    delete audio.dataset.retried;
  } catch {
    // ignore
  }
  const src = proxyHandler(stream.url, useProxy);
  audio.muted = false;
  audio.volume = 1;
  audio.src = src;
  return src;
}

/**
 * ytify player(id) core — resolve + set src + play.
 * Returns true if src was set.
 */
export async function ytifyPlay(
  id: string,
  audio: HTMLAudioElement,
  signal?: AbortSignal
): Promise<{ ok: true; src: string; lengthSeconds: number } | { ok: false; error: string }> {
  const data = await getStreamData(id, signal);
  if (!data || !('adaptiveFormats' in data)) {
    const err = data as { error?: string; message?: string };
    return { ok: false, error: err?.message || err?.error || 'Loading Audio Failed' };
  }

  try {
    // Inv hit → rewrite via sticky; emergency /api/s → direct googlevideo (ytify proxy='')
    const useProxy = Boolean(data.proxy);
    const src = await applyAudioStreams(audio, data.adaptiveFormats, useProxy);
    void audio.play().catch(() => undefined);
    return {
      ok: true,
      src,
      lengthSeconds: Number(data.lengthSeconds || 0),
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export function getStickyProxy(): string {
  return readStickyProxy();
}
