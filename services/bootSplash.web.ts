const MIN_SHOW_MS = 1800;
const FADE_MS = 480;

declare global {
  interface Window {
    __vybeBootAt?: number;
    __vybeBootHideTimer?: number;
  }
}

/** Hide the HTML #vybe-boot splash once React is alive (keeps a short vinyl animation). */
export function hideBootSplash(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('vybe-boot');
  if (!el || el.classList.contains('hide')) return;

  const started = typeof window.__vybeBootAt === 'number' ? window.__vybeBootAt : Date.now();
  const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - started));

  const finish = () => {
    if (!el.isConnected || el.classList.contains('hide')) return;
    el.classList.add('hide');
    window.setTimeout(() => {
      try {
        el.remove();
      } catch {
        // ignore
      }
    }, FADE_MS);
  };

  if (wait <= 0) {
    finish();
    return;
  }

  if (window.__vybeBootHideTimer) window.clearTimeout(window.__vybeBootHideTimer);
  window.__vybeBootHideTimer = window.setTimeout(finish, wait);
}
