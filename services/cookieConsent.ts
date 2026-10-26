import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@vybe/cookie-consent-v1';

export type CookieConsent = {
  /** Always true — needed for app (library, theme, cache) */
  necessary: true;
  /** Optional extras (future analytics / personalization) */
  preferences: boolean;
  decidedAt: number;
};

export const DEFAULT_NECESSARY: CookieConsent = {
  necessary: true,
  preferences: false,
  decidedAt: 0,
};

let memory: CookieConsent | null = null;

export async function loadCookieConsent(): Promise<CookieConsent | null> {
  if (memory && memory.decidedAt > 0) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (!parsed?.decidedAt) return null;
    memory = { necessary: true, preferences: Boolean(parsed.preferences), decidedAt: parsed.decidedAt };
    return memory;
  } catch {
    return null;
  }
}

export async function saveCookieConsent(partial: { preferences: boolean }): Promise<CookieConsent> {
  const next: CookieConsent = {
    necessary: true,
    preferences: partial.preferences,
    decidedAt: Date.now(),
  };
  memory = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function peekCookieConsent(): CookieConsent | null {
  return memory;
}
