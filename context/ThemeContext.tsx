import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  DarkColors,
  LightColors,
  type ThemeColors,
  type ThemeMode,
} from '@/constants/theme';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Prefer dark (wire tension). Light only when system is explicitly light. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  // Default to dark music UI; only flip when system is explicitly light
  const mode: ThemeMode = system === 'light' ? 'light' : 'dark';
  const colors = mode === 'dark' ? DarkColors : LightColors;

  const value = useMemo(
    () => ({
      mode,
      colors,
      isDark: mode === 'dark',
    }),
    [mode, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
