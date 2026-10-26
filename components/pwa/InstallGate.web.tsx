import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { isMarketingHost } from '@/constants/site';
import {
  isStandalonePwa,
  mustInstallBeforeUse,
  showInstallTutorial,
} from '@/services/installGate';

const ALLOWED = new Set([
  '/welcome',
  '/privacy',
  '/terms',
  '/cookies',
]);

/**
 * On app host mobile Safari/Chrome: block until installed as PWA.
 * Marketing host is handled by MarketingGate (no install hard-gate there).
 */
export function InstallGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isMarketingHost()) return;

    if (!mustInstallBeforeUse()) {
      if (isStandalonePwa()) {
        document.documentElement.classList.add('vybe-pwa');
        document.documentElement.classList.remove('vybe-browser');
      }
      return;
    }

    document.documentElement.classList.add('vybe-browser');
    document.documentElement.classList.remove('vybe-pwa');

    const path = pathname || '/';
    const ok = ALLOWED.has(path) || path.startsWith('/welcome');
    if (!ok) {
      router.replace('/welcome');
    }
  }, [pathname, router]);

  useEffect(() => {
    if (isMarketingHost() || !mustInstallBeforeUse()) return;
    // Auto-show tutorial shortly after landing on welcome
    const t = window.setTimeout(() => showInstallTutorial(), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isMarketingHost()) return;
    const onVis = () => {
      // User may have just installed and reopened from Home
      if (isStandalonePwa()) {
        document.documentElement.classList.add('vybe-pwa');
        document.documentElement.classList.remove('vybe-browser');
        window.location.replace('/');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener('appinstalled', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('appinstalled', onVis);
    };
  }, []);

  return null;
}
