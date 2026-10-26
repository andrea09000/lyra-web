import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function readCssSafeTop(): number {
  if (typeof document === 'undefined') return 0;
  try {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)';
    document.body.appendChild(el);
    const px = parseFloat(getComputedStyle(el).paddingTop) || 0;
    document.body.removeChild(el);
    return px;
  } catch {
    return 0;
  }
}

/**
 * Top padding for headers — safe-area + light breathing room.
 */
export function useTopPad(extra = 10): number {
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    if (Platform.OS !== 'web') {
      return insets.top + extra;
    }
    const measured = Math.max(insets.top, readCssSafeTop());
    // Floor only when APIs report nothing
    const top = measured > 0 ? measured : 10;
    return top + extra;
  }, [insets.top, extra]);
}
