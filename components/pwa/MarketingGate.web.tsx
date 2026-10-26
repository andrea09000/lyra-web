import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { isMarketingHost, APP_ORIGIN } from '@/constants/site';

const MARKETING_PATHS = new Set([
  '/welcome',
  '/privacy',
  '/terms',
  '/cookies',
]);

/**
 * On muscivyb.com: only landing + legal.
 * App routes bounce to welcome; deep app links go to app.vybe.com.
 */
export function MarketingGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isMarketingHost()) return;

    const path = pathname || '/';
    if (path === '/' || path === '/index') {
      router.replace('/welcome');
      return;
    }

    const ok =
      MARKETING_PATHS.has(path) ||
      path.startsWith('/welcome') ||
      path.startsWith('/privacy') ||
      path.startsWith('/terms') ||
      path.startsWith('/cookies');

    if (!ok) {
      // Tabs / player / onboarding belong on the app host
      if (typeof window !== 'undefined') {
        window.location.replace(`${APP_ORIGIN}${path}`);
        return;
      }
      router.replace('/welcome');
    }
  }, [pathname, router]);

  return null;
}
