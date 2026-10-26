import { useWindowDimensions } from 'react-native';

/** Sidebar + wide layout kick in here */
export const DESKTOP_MIN_WIDTH = 900;
export const DESKTOP_SIDEBAR_WIDTH = 84;
export const DESKTOP_CONTENT_MAX = 1120;
export const DESKTOP_PLAYER_HEIGHT = 84;

export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_MIN_WIDTH;
}

/** Scroll/list padding under floating tab + mini player (mobile) vs desktop dock */
export function useTabBottomPad(mobile = 190): number {
  const desktop = useDesktop();
  return desktop ? 40 : mobile;
}
