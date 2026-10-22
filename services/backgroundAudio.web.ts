/**
 * Helpers for reliable background playback on mobile browsers / PWA.
 */

let unlocked = false;

/** Call from the first user tap — unlocks iOS/Android autoplay for later tracks. */
export function unlockWebAudio(): void {
  // iOS 17+: mark session as long-form playback (keeps audio when app backgrounds)
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // ignore
  }

  if (unlocked || typeof document === 'undefined') return;
  try {
    const a = document.createElement('audio');
    a.src =
      'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//////////////////////////////////////////////////////////////////8AAAA8TEFNRTMuMTAwBK8AAAAAAAAAABUgJAUHQQAB9gAAAnGMHprsAAAAAAAAAAAAAAAAAAAA';
    a.preload = 'auto';
    a.volume = 0.01;
    void a.play().then(() => {
      a.pause();
      a.removeAttribute('src');
      unlocked = true;
    }).catch(() => {
      unlocked = true; // even a failed attempt often unlocks the gesture chain
    });
  } catch {
    unlocked = true;
  }
}

export function createBackgroundAudioElement(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
  audio.setAttribute('x-webkit-airplay', 'allow');
  // Helps iOS treat this as music that may continue in background
  audio.setAttribute('aria-hidden', 'true');
  audio.preload = 'auto';
  audio.autoplay = false;
  // NEVER start muted — muted play is killed when the screen locks on iOS
  audio.muted = false;
  audio.volume = 1;
  // Keep element in DOM — some mobile browsers suspend detached Audio()
  Object.assign(audio.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    opacity: '0.01',
    pointerEvents: 'none',
    zIndex: '-1',
    bottom: '0',
    left: '0',
  });
  audio.setAttribute('data-lyra-audio', '1');
  document.body.appendChild(audio);
  return audio;
}

export function bindKeepAlive(
  audio: HTMLAudioElement,
  shouldPlay: () => boolean
): () => void {
  const kick = () => {
    if (!shouldPlay()) return;
    if (audio.paused && audio.src) {
      void audio.play().catch(() => undefined);
    }
  };

  // Browser often fires pause when locking the screen — restart immediately
  const onPause = () => {
    if (!shouldPlay()) return;
    // microtask: let the pause settle, then resume
    queueMicrotask(() => {
      if (shouldPlay() && audio.paused) void audio.play().catch(() => undefined);
    });
  };

  const onVis = () => kick();
  const onPageShow = () => kick();

  audio.addEventListener('pause', onPause);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', onVis);
  window.addEventListener('pageshow', onPageShow);
  // Page Lifecycle API (Chromium)
  document.addEventListener('freeze', kick as EventListener);
  document.addEventListener('resume', kick as EventListener);

  const timer = window.setInterval(kick, 2000);

  return () => {
    clearInterval(timer);
    audio.removeEventListener('pause', onPause);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', onVis);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('freeze', kick as EventListener);
    document.removeEventListener('resume', kick as EventListener);
  };
}
