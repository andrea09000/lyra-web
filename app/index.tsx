import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { APP_NAME } from '@/constants/brand';
import { isMarketingHost } from '@/constants/site';
import { useLibrary } from '@/context/LibraryContext';
import { hideBootSplash } from '@/services/bootSplash';
import { mustInstallBeforeUse } from '@/services/installGate';

const BOOT_BG = '#070806';
const BOOT_INK = '#F4F7F2';

export default function Gate() {
  const { ready, onboardingDone } = useLibrary();

  useEffect(() => {
    if (ready) hideBootSplash();
  }, [ready]);

  if (!ready) {
    // Underlay while HTML #vybe-boot plays — same palette, no white/black flash
    return (
      <View style={styles.root}>
        <View style={styles.glow} />
        <Image
          source={{ uri: '/logo.png' }}
          style={styles.logo}
          accessibilityLabel={APP_NAME}
        />
        <Text style={styles.word}>{APP_NAME}</Text>
      </View>
    );
  }

  // Marketing domain → landing only (app lives on app.vybe.com)
  if (Platform.OS === 'web' && isMarketingHost()) {
    return <Redirect href="/welcome" />;
  }

  // App host, mobile browser: install PWA first (tutorial on /welcome)
  if (Platform.OS === 'web' && mustInstallBeforeUse()) {
    return <Redirect href="/welcome" />;
  }

  if (!onboardingDone) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BOOT_BG,
    gap: 28,
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(72, 210, 180, 0.12)',
  },
  logo: {
    width: 196,
    height: 196,
    borderRadius: 64,
  },
  word: {
    fontFamily: 'Unbounded_700Bold',
    fontSize: 30,
    letterSpacing: -0.7,
    color: BOOT_INK,
  },
});
