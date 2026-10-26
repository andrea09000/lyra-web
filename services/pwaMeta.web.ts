/**
 * Expo Metro/dev HTML ignores app/+html.tsx — inject PWA + SEO metas.
 */

import { APP_NAME, APP_TAGLINE } from '@/constants/brand';
import { SEO_DESCRIPTION, SEO_KEYWORDS, SITE_LOCALE, SITE_URL } from '@/constants/site';

function upsertMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertProperty(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string, attrs?: Record<string, string>) {
  let el: HTMLLinkElement | null = null;
  if (rel === 'canonical') {
    el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  } else if (rel === 'manifest') {
    el = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  } else if (attrs?.sizes) {
    el = document.querySelector(
      `link[rel="${rel}"][sizes="${attrs.sizes}"]`
    ) as HTMLLinkElement | null;
  } else if (rel === 'sitemap') {
    el = document.querySelector('link[rel="sitemap"]') as HTMLLinkElement | null;
  }
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
  let style = document.getElementById('vybe-pwa-shell') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'vybe-pwa-shell';
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
  min-height: 100%;
  min-height: 100dvh;
  min-height: -webkit-fill-available;
  background-color: ${background} !important;
}
/* Kill legacy status overlay that clipped page titles */
#vybe-status-fill {
  display: none !important;
  height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
`;
}

function removeStatusFill() {
  document.getElementById('vybe-status-fill')?.remove();
  document.getElementById('lyra-status-fill')?.remove();
}

/** Metro/dev ignores +html.tsx — mount vinyl splash if the static HTML didn't. */
function ensureBootSplash() {
  if (document.getElementById('vybe-boot')) {
    if (typeof (window as Window & { __vybeBootAt?: number }).__vybeBootAt !== 'number') {
      (window as Window & { __vybeBootAt?: number }).__vybeBootAt = Date.now();
    }
    return;
  }

  if (!document.getElementById('vybe-boot-css')) {
    const style = document.createElement('style');
    style.id = 'vybe-boot-css';
    style.textContent = `
#vybe-boot{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;background:radial-gradient(ellipse 70% 55% at 50% 42%,rgba(72,210,180,.14) 0%,transparent 55%),radial-gradient(ellipse 55% 45% at 58% 48%,rgba(64,150,255,.1) 0%,transparent 50%),#070806;transition:opacity .45s ease,visibility .45s ease,transform .45s ease}
.vybe-boot-stage{position:relative;width:260px;height:260px;display:flex;align-items:center;justify-content:center}
.vybe-boot-glow{position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(circle,rgba(120,235,200,.28) 0%,rgba(70,160,255,.12) 42%,transparent 70%);animation:vybe-glow 2.4s ease-in-out infinite;pointer-events:none}
.vybe-boot-disc{position:relative;width:196px;height:196px;border-radius:50%;animation:vybe-spin 3.6s linear infinite;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 22px 52px rgba(0,0,0,.45),0 0 64px rgba(90,220,190,.2);will-change:transform}
.vybe-boot-logo{width:196px;height:196px;border-radius:50%;display:block;object-fit:cover}
.vybe-boot-notes{position:absolute;inset:0;pointer-events:none}
.vybe-note{position:absolute;left:50%;top:50%;font-size:36px;line-height:1;color:#9AF5D8;text-shadow:0 0 18px rgba(120,235,200,.6);opacity:0;animation:vybe-note 2.8s ease-out infinite;will-change:transform,opacity}
.vybe-note.n1{--dx:-82px;--dy:-118px;--rot:-18deg;animation-delay:.15s;font-size:40px;color:#8EF0D0}
.vybe-note.n2{--dx:94px;--dy:-110px;--rot:16deg;animation-delay:.55s;font-size:34px;color:#7EC8FF}
.vybe-note.n3{--dx:-110px;--dy:-42px;--rot:-28deg;animation-delay:.95s;font-size:32px;color:#A8F6E0}
.vybe-note.n4{--dx:112px;--dy:-34px;--rot:22deg;animation-delay:1.25s;font-size:36px;color:#6EB8FF}
.vybe-note.n5{--dx:-62px;--dy:-148px;--rot:8deg;animation-delay:1.6s;font-size:28px;color:#B5FFE8}
.vybe-note.n6{--dx:72px;--dy:-140px;--rot:-12deg;animation-delay:2s;font-size:32px;color:#8AD0FF}
.vybe-boot-word{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:700;font-size:36px;letter-spacing:-.7px;color:#F4F7F2;opacity:0;transform:translateY(8px);animation:vybe-word .7s ease .35s forwards}
#vybe-boot.hide{opacity:0;visibility:hidden;pointer-events:none;transform:scale(1.03)}
@keyframes vybe-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes vybe-glow{0%,100%{opacity:.7;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}
@keyframes vybe-note{0%{opacity:0;transform:translate(-50%,-50%) scale(.55) rotate(0)}18%{opacity:.95}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1.05) rotate(var(--rot))}}
@keyframes vybe-word{to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.vybe-boot-disc,.vybe-boot-glow,.vybe-note{animation:none!important}.vybe-boot-notes{display:none}.vybe-boot-word{opacity:1;transform:none;animation:none}}
`;
    document.head.appendChild(style);
  }

  const boot = document.createElement('div');
  boot.id = 'vybe-boot';
  boot.setAttribute('aria-hidden', 'true');
  boot.innerHTML = `
    <div class="vybe-boot-stage">
      <div class="vybe-boot-glow"></div>
      <div class="vybe-boot-notes">
        <span class="vybe-note n1">♪</span>
        <span class="vybe-note n2">♫</span>
        <span class="vybe-note n3">♩</span>
        <span class="vybe-note n4">♬</span>
        <span class="vybe-note n5">♪</span>
        <span class="vybe-note n6">♫</span>
      </div>
      <div class="vybe-boot-disc">
        <img src="/logo.png" alt="" width="196" height="196" class="vybe-boot-logo" decoding="async" />
      </div>
    </div>
    <div class="vybe-boot-word">${APP_NAME}</div>
  `;
  document.body.prepend(boot);
  (window as Window & { __vybeBootAt?: number }).__vybeBootAt = Date.now();
}

export function applyPwaMeta(background = '#0A0A0A') {
  if (typeof document === 'undefined') return;

  ensureBootSplash();

  const title = `${APP_NAME} — ${APP_TAGLINE}`;
  const ogImage = `${SITE_URL}/icon.png`;

  document.title = title;
  upsertMeta('description', SEO_DESCRIPTION);
  upsertMeta('keywords', SEO_KEYWORDS);
  upsertMeta('robots', 'index, follow, max-image-preview:large');
  upsertMeta('author', APP_NAME);
  upsertLink('canonical', `${SITE_URL}/`);

  upsertProperty('og:type', 'website');
  upsertProperty('og:site_name', APP_NAME);
  upsertProperty('og:locale', SITE_LOCALE);
  upsertProperty('og:title', title);
  upsertProperty('og:description', SEO_DESCRIPTION);
  upsertProperty('og:url', `${SITE_URL}/`);
  upsertProperty('og:image', ogImage);

  upsertMeta('twitter:card', 'summary');
  upsertMeta('twitter:title', title);
  upsertMeta('twitter:description', SEO_DESCRIPTION);
  upsertMeta('twitter:image', ogImage);

  upsertMeta('mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  // Translucent so content can pad below the notch via env(safe-area-inset-top)
  upsertMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  upsertMeta('apple-mobile-web-app-title', APP_NAME);
  upsertMeta('application-name', APP_NAME);
  upsertMeta('format-detection', 'telephone=no');
  upsertMeta(
    'viewport',
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
  );
  upsertThemeColor(background);
  upsertLink('manifest', '/manifest.webmanifest');
  upsertLink('apple-touch-icon', '/apple-touch-icon.png', { sizes: '180x180' });
  upsertLink('apple-touch-icon', '/apple-touch-icon.png');
  upsertLink('icon', '/icon-192.png', { type: 'image/png', sizes: '192x192' });
  upsertLink('sitemap', '/sitemap.xml', { type: 'application/xml' });
  upsertShellCss(background);
  removeStatusFill();

  const nav = window.navigator as Navigator & { standalone?: boolean };
  const installed =
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches;
  document.documentElement.classList.toggle('vybe-pwa', installed);
  document.documentElement.classList.toggle('vybe-browser', !installed);
}

applyPwaMeta('#0A0A0A');
