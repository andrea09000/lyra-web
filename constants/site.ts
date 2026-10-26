/**
 * Two public surfaces:
 * - Marketing site (landing, SEO, legale): muscivyb.com
 * - App PWA (player, libreria): app.vybe.com
 *
 * Until DNS is pointed at this Vercel project, aria-web-xi.vercel.app
 * and localhost behave as the **app** host.
 */

export const MARKETING_ORIGIN = 'https://muscivyb.com';
export const APP_ORIGIN = 'https://app.vybe.com';

/** Interim / preview host (treat as app). */
export const PREVIEW_ORIGIN = 'https://aria-web-xi.vercel.app';

/** SEO / marketing canonical (sitemap, OG for the brand site). */
export const SITE_ORIGIN = MARKETING_ORIGIN;
export const SITE_URL = SITE_ORIGIN;

export const SITE_LANG = 'it';
export const SITE_LOCALE = 'it_IT';

export const SEO_DESCRIPTION =
  'Vybe — ascolta musica a tutto schermo. Cerca brani, crea playlist e salva i preferiti sul dispositivo. PWA installabile, senza account obbligatorio.';
export const SEO_KEYWORDS =
  'Vybe, musica, streaming, playlist, PWA, ascolta musica, player musicale, brani, artisti';

const MARKETING_HOSTS = new Set([
  'muscivyb.com',
  'www.muscivyb.com',
]);

const APP_HOSTS = new Set([
  'app.vybe.com',
  'www.app.vybe.com',
  'aria-web-xi.vercel.app',
  'localhost',
  '127.0.0.1',
]);

function currentHostname(): string {
  if (typeof window === 'undefined') return '';
  return (window.location.hostname || '').toLowerCase();
}

/** True on the public marketing domain. */
export function isMarketingHost(): boolean {
  const host = currentHostname();
  if (!host) return false;
  return MARKETING_HOSTS.has(host);
}

/** True on the app / PWA host (incl. preview + local). */
export function isAppHost(): boolean {
  const host = currentHostname();
  if (!host) return true; // SSR / native → treat as app
  if (MARKETING_HOSTS.has(host)) return false;
  if (APP_HOSTS.has(host)) return true;
  // *.vercel.app previews → app
  if (host.endsWith('.vercel.app')) return true;
  return true;
}

/** Origin to open when the user should enter the product. */
export function appEntryUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && isAppHost()) {
    return `${window.location.origin}${clean === '/' ? '/' : clean}`;
  }
  return `${APP_ORIGIN}${clean === '/' ? '' : clean}`;
}

/** Origin for “sito Vybe” links from inside the app. */
export function marketingEntryUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && isMarketingHost()) {
    return `${window.location.origin}${clean === '/' ? '/' : clean}`;
  }
  return `${MARKETING_ORIGIN}${clean === '/' ? '' : clean}`;
}
