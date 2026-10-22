import React, { createContext, useContext, useMemo } from 'react';
import {
  DarkColors,
  type ThemeColors,
  type ThemeMode,
} from '@/constants/theme';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Lyra is always dark (charcoal + blue). Never follow system light mode —
 * body/PWA shell is dark, and light ink (#0A0A0A) made artist names invisible.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(
    () => ({
      mode: 'dark' as const,
      colors: DarkColors,
      isDark: true,
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
