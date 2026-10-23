/**
 * Expo Metro/dev HTML ignores app/+html.tsx — inject PWA metas + kill the white status-bar strip.
 */

function upsertMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string, attrs?: Record<string, string>) {
  let el =
    rel === 'manifest'
      ? (document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null)
      : attrs?.sizes
        ? (document.querySelector(
            `link[rel="${rel}"][sizes="${attrs.sizes}"]`
          ) as HTMLLinkElement | null)
        : null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  }
}

function upsertThemeColor(color: string) {
  // Remove media-specific theme-colors that can force a light status strip
  document.querySelectorAll('meta[name="theme-color"]').forEach((n) => n.remove());
  const el = document.createElement('meta');
  el.setAttribute('name', 'theme-color');
  el.setAttribute('content', color);
  document.head.appendChild(el);
}

function upsertShellCss(background: string) {
  let style = document.getElementById('lyra-pwa-shell') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'lyra-pwa-shell';
    document.head.appendChild(style);
  }
  // Cover the notch / status-bar region so no white html/body shows through
  style.textContent = `
html, body, #root {
  background-color: ${background} !important;
  background: ${background} !important;
}
html {
  height: 100%;
  height: -webkit-fill-available;
  background-color: ${background} !important;
}
body {
  margin: 0;
  min-height: 100%;
  min-height: 100dvh;
  min-height: -webkit-fill-available;
  background-color: ${background} !important;
}
#root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  min-height: 100dvh;
  min-height: -webkit-fill-available;
  background-color: ${background} !important;
  position: relative;
}
/* Fill viewport — do not center (centering collapses RN Web to 0 height) */
#root > * {
  flex: 1 1 auto !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  min-height: 100dvh !important;
  align-self: stretch !important;
}
/* Kill legacy status overlay that clipped page titles */
#lyra-status-fill {
  display: none !important;
  height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
`;
}

function removeStatusFill() {
  document.getElementById('lyra-status-fill')?.remove();
}

export function applyPwaMeta(background = '#0A0A0A') {
  if (typeof document === 'undefined') return;

  upsertMeta('mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  // Translucent so content can pad below the notch via env(safe-area-inset-top)
  upsertMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  upsertMeta('apple-mobile-web-app-title', 'Lyra');
  upsertMeta('application-name', 'Lyra');
  upsertMeta('format-detection', 'telephone=no');
  upsertMeta(
    'viewport',
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
  );
  upsertThemeColor(background);
  upsertLink('manifest', '/manifest.webmanifest');
  upsertLink('apple-touch-icon', '/icon-180.png', { sizes: '180x180' });
  upsertLink('apple-touch-icon', '/icon-180.png');
  upsertLink('icon', '/icon-192.png', { type: 'image/png', sizes: '192x192' });
  upsertShellCss(background);
  removeStatusFill();

  const nav = window.navigator as Navigator & { standalone?: boolean };
  const installed =
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches;
  document.documentElement.classList.toggle('lyra-pwa', installed);
  document.documentElement.classList.toggle('lyra-browser', !installed);
}

applyPwaMeta('#0A0A0A');
