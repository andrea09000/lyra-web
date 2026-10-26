import { APP_NAME } from '@/constants/brand';

const CSS_HREF = '/add-to-homescreen/add-to-homescreen.min.css';
const JS_SRC = '/add-to-homescreen/add-to-homescreen_it.min.js';
const ASSET_URL = '/add-to-homescreen/assets/img/';
const ICON_URL = '/logo.png';

type AthInstance = {
  show: (locale?: string) => unknown;
  isStandAlone: () => boolean;
  clearModalDisplayCount: () => void;
  closeModal?: () => void;
};

type AthFactory = (opts: {
  appName: string;
  appNameDisplay?: 'standalone' | 'inline';
  appIconUrl: string;
  assetUrl: string;
  maxModalDisplayCount?: number;
  displayOptions?: { showMobile: boolean; showDesktop: boolean };
  allowClose?: boolean;
  showArrow?: boolean;
}) => AthInstance;

declare global {
  interface Window {
    AddToHomeScreen?: AthFactory;
    AddToHomeScreenInstance?: AthInstance;
  }
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

export function isMobileWebBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalonePwa()) return false;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    ua
  );
  const narrow = window.innerWidth < 900;
  // Touch phones / tablets in browser — not wide desktop
  return mobileUa || (narrow && navigator.maxTouchPoints > 0);
}

/** Phone/tablet browser must install PWA first. Desktop web can use freely. */
export function mustInstallBeforeUse(): boolean {
  return isMobileWebBrowser() && !isStandalonePwa();
}

function loadStylesheet(href: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('link[data-vybe-ath="1"]')) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-vybe-ath', '1');
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AddToHomeScreen) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[data-vybe-ath="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('ath script')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-vybe-ath', '1');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('ath script'));
    document.body.appendChild(script);
  });
}

async function ensureAth(): Promise<AthInstance | null> {
  await loadStylesheet(CSS_HREF);
  await loadScript(JS_SRC);
  if (!window.AddToHomeScreen) return null;

  if (!window.AddToHomeScreenInstance) {
    window.AddToHomeScreenInstance = window.AddToHomeScreen({
      appName: APP_NAME,
      appNameDisplay: 'standalone',
      appIconUrl: ICON_URL,
      assetUrl: ASSET_URL,
      // Keep showing until installed — no soft skip on mobile gate
      maxModalDisplayCount: -1,
      displayOptions: { showMobile: true, showDesktop: false },
      allowClose: false,
      showArrow: true,
    });
  }
  try {
    window.AddToHomeScreenInstance.clearModalDisplayCount();
  } catch {
    // ignore
  }
  return window.AddToHomeScreenInstance;
}

/** Open the add-to-home-screen tutorial (Italian). */
export function showInstallTutorial(): void {
  if (typeof window === 'undefined') return;
  void ensureAth().then((instance) => {
    if (!instance || instance.isStandAlone()) return;
    instance.show('it');
  });
}
