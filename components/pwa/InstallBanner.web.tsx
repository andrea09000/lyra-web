import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isStandalonePwa, mustInstallBeforeUse, showInstallTutorial } from '@/services/installGate';

/**
 * Soft prompt on desktop-ish browsers only.
 * Mobile browsers are hard-gated via InstallGate + welcome CTA.
 */
export function InstallBanner() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStandalonePwa() || mustInstallBeforeUse()) return;
    // Desktop: optional gentle tip — skip auto modal
  }, []);

  return null;
}

export { showInstallTutorial };
