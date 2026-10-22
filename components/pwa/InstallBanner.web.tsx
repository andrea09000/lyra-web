import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // iOS Home Screen PWA
  if (nav.standalone === true) return true;
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const SKIP_KEY = 'lyra-skip-install-gate';

function wasInstallSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function persistInstallSkip() {
  try {
    localStorage.setItem(SKIP_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Full-screen gate while still inside Safari/Chrome.
 * Browser chrome (domain + bottom buttons) ONLY disappears after
 * “Aggiungi a Home” and opening the Lyra icon.
 */
export function InstallBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showGate, setShowGate] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const sync = () => {
      const installed = isRunningAsInstalledApp();
      setShowGate(!installed && !wasInstallSkipped());
      setIos(isIos());
      document.documentElement.classList.toggle('lyra-pwa', installed);
      document.documentElement.classList.toggle('lyra-browser', !installed);
    };
    sync();

    const onChange = () => sync();
    const m1 = window.matchMedia('(display-mode: standalone)');
    const m2 = window.matchMedia('(display-mode: fullscreen)');
    m1.addEventListener?.('change', onChange);
    m2.addEventListener?.('change', onChange);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    return () => {
      m1.removeEventListener?.('change', onChange);
      m2.removeEventListener?.('change', onChange);
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  }, []);

  const installAndroid = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, []);

  if (!showGate) return null;

  return (
    <View
      style={[
        styles.gate,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 24) + 12,
          paddingBottom: Math.max(insets.bottom, 20) + 12,
        },
      ]}
    >
      <View style={styles.brandRow}>
        <View style={[styles.bars, { backgroundColor: colors.green }]} />
        <View style={[styles.bars, { backgroundColor: colors.green, opacity: 0.7, height: 18 }]} />
        <View style={[styles.bars, { backgroundColor: colors.green, opacity: 0.4, height: 12 }]} />
        <Text style={[styles.brand, { color: colors.ink }]}>LYRA</Text>
      </View>

      <Text style={[styles.headline, { color: colors.ink }]}>
        Come RIKA: tutto schermo
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        Se hai già un’icona Lyra con le barre di Safari, eliminala dalla Home e reinstallala
        (altrimenti iPhone la riapre ancora come sito).
      </Text>

      <View style={[styles.card, { backgroundColor: colors.elev2, borderColor: colors.line }]}>
        {ios ? (
          <>
            <Step n="1" colors={colors} text="Apri questo link in Safari (non nel browser con la X)" />
            <Step n="2" colors={colors} text="Tieni premuta l’icona Lyra sulla Home → Elimina segnalibro" />
            <Step n="3" colors={colors} text="In Safari: Condividi (□↑) → “Aggiungi a Home” → Aggiungi" />
            <Step n="4" colors={colors} text="Apri solo dall’icona nuova — senza dominio né tasti sotto" />
          </>
        ) : (
          <>
            <Step n="1" colors={colors} text="Disinstalla l’icona vecchia se c’era ancora il browser" />
            <Step n="2" colors={colors} text="Tocca Installa, oppure menu ⋮ → “Installa app”" />
            <Step n="3" colors={colors} text="Apri Lyra dall’icona — come RIKA, a tutto schermo" />
          </>
        )}
      </View>

      {!ios && deferred ? (
        <Pressable
          onPress={() => void installAndroid()}
          style={[styles.cta, { backgroundColor: colors.green }]}
        >
          <Ionicons name="download-outline" size={22} color="#12140F" />
          <Text style={styles.ctaText}>Installa Lyra</Text>
        </Pressable>
      ) : null}

      {!ios && !deferred ? (
        <View style={[styles.secondary, { borderColor: colors.line }]}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.ink} />
          <Text style={[styles.secondaryText, { color: colors.ink }]}>
            Menu del browser → “Installa app” / “Aggiungi a schermata Home”
          </Text>
        </View>
      ) : null}

      {ios ? (
        <Pressable
          onPress={() => void copyLink()}
          style={[styles.secondary, { borderColor: colors.line }]}
        >
          <Ionicons name="link-outline" size={18} color={colors.ink} />
          <Text style={[styles.secondaryText, { color: colors.ink }]}>
            {copied ? 'Link copiato — aprilo in Safari' : 'Copia link per aprirlo in Safari'}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => {
          persistInstallSkip();
          setShowGate(false);
        }}
        style={styles.skip}
        hitSlop={12}
      >
        <Text style={[styles.skipText, { color: colors.muted }]}>
          Continua nel browser (resteranno le barre)
        </Text>
      </Pressable>
    </View>
  );
}

function Step({
  n,
  text,
  colors,
}: {
  n: string;
  text: string;
  colors: { green: string; ink: string };
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.badge, { backgroundColor: colors.green }]}>
        <Text style={styles.badgeText}>{n}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginBottom: 8,
  },
  bars: {
    width: 5,
    height: 24,
    borderRadius: 2,
  },
  brand: {
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    letterSpacing: 2,
    marginLeft: 8,
  },
  headline: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 28,
    lineHeight: 34,
  },
  sub: {
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
    color: '#12140F',
  },
  stepText: {
    flex: 1,
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
    lineHeight: 21,
  },
  cta: {
    marginTop: 8,
    height: 52,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
    color: '#12140F',
  },
  secondary: {
    marginTop: 4,
    height: 48,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
  },
  skip: {
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
  },
  skipText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
});
