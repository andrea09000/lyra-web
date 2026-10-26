import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  loadCookieConsent,
  saveCookieConsent,
  type CookieConsent,
} from '@/services/cookieConsent';

const LEGAL_PATHS = new Set(['/privacy', '/terms', '/cookies', '/onboarding', '/welcome']);

export function CookieBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [consent, setConsent] = useState<CookieConsent | null | undefined>(undefined);

  useEffect(() => {
    void loadCookieConsent().then(setConsent);
  }, []);

  if (consent === undefined) return null;
  if (consent && consent.decidedAt > 0) return null;
  if (pathname && LEGAL_PATHS.has(pathname)) return null;

  const decide = async (preferences: boolean) => {
    const next = await saveCookieConsent({ preferences });
    setConsent(next);
  };

  const openCookies = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      router.push('/cookies');
      return;
    }
    void Linking.openURL('/cookies');
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          paddingBottom: Math.max(insets.bottom, 14),
        },
      ]}
      accessibilityRole="summary"
    >
      <Text style={[styles.title, { color: colors.ink }]}>Cookie e privacy</Text>
      <Text style={[styles.copy, { color: colors.muted }]}>
        Usiamo storage tecnico per far funzionare Vybe (libreria, cache, PWA). Puoi accettare anche
        le preferenze opzionali.{' '}
        <Text style={[styles.link, { color: colors.green }]} onPress={openCookies}>
          Cookie Policy
        </Text>
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => void decide(false)}
          style={({ pressed }) => [
            styles.btnGhost,
            { borderColor: colors.line, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.btnGhostText, { color: colors.ink }]}>Solo necessari</Text>
        </Pressable>
        <Pressable
          onPress={() => void decide(true)}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.green, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.onAccent }]}>Accetta tutto</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 100,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 14,
    gap: 10,
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  title: {
    fontFamily: Type.uiBold,
    fontSize: 15,
  },
  copy: {
    fontFamily: Type.ui,
    fontSize: 13,
    lineHeight: 19,
  },
  link: {
    fontFamily: Type.uiSemi,
    textDecorationLine: 'underline',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: Type.uiSemi,
    fontSize: 14,
  },
  btnGhost: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontFamily: Type.uiSemi,
    fontSize: 13,
  },
});
