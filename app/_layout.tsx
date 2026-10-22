import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
} from '@expo-google-fonts/sora';
import {
  Unbounded_500Medium,
  Unbounded_600SemiBold,
  Unbounded_700Bold,
} from '@expo-google-fonts/unbounded';
import 'react-native-reanimated';

import { InstallBanner } from '@/components/pwa/InstallBanner';
import { LibraryProvider } from '@/context/LibraryContext';
import { PlayerProvider } from '@/context/PlayerContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { applyPwaMeta } from '@/services/pwaMeta';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

if (Platform.OS === 'web') {
  applyPwaMeta();
}

function registerServiceWorker() {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = async () => {
    applyPwaMeta();
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });

      const askUpdate = () => {
        void reg.update().catch(() => undefined);
      };

      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            installing.postMessage?.('SKIP_WAITING');
            reg.waiting?.postMessage('SKIP_WAITING');
          }
        });
      };
      reg.addEventListener('updatefound', onUpdateFound);

      // Soft reload once when a new SW takes control — avoid tight reload loops
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        try {
          const key = 'lyra-sw-reload';
          const last = Number(sessionStorage.getItem(key) || 0);
          if (Date.now() - last < 8000) return;
          sessionStorage.setItem(key, String(Date.now()));
        } catch {
          // ignore
        }
        window.location.reload();
      });

      askUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') askUpdate();
      });
      window.addEventListener('focus', askUpdate);
    } catch {
      // optional
    }
  };

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register());
}

function RootNav() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    applyPwaMeta(isDark ? '#0A0A0A' : '#F5F5F7');
  }, [isDark, colors.background]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="player"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="mood/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="playlist/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="tastes" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="import" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
        <InstallBanner />
      </View>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Unbounded_500Medium,
    Unbounded_600SemiBold,
    Unbounded_700Bold,
  });

  useEffect(() => {
    // Never block the whole app on fonts — that was a permanent black screen on slow PWA.
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <ThemeProvider>
      <LibraryProvider>
        <PlayerProvider>
          <RootNav />
        </PlayerProvider>
      </LibraryProvider>
    </ThemeProvider>
  );
}
