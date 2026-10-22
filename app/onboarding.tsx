import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MAX_TASTE_PICKS } from '@/constants/artists';
import { Radius, Spacing } from '@/constants/theme';
import { BrandMark } from '@/components/ui/BrandMark';
import { ArtistPicker } from '@/components/music/ArtistPicker';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { TasteArtist } from '@/types/music';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { completeOnboarding } = useLibrary();
  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<Record<string, TasteArtist>>({});

  const selected = useMemo(() => Object.values(picked), [picked]);
  const canContinue = selected.length === MAX_TASTE_PICKS;

  const toggle = (artist: TasteArtist) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[artist.id]) {
        delete next[artist.id];
        return next;
      }
      if (Object.keys(next).length >= MAX_TASTE_PICKS) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      next[artist.id] = artist;
      return next;
    });
  };

  const finish = async () => {
    if (!canContinue) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await completeOnboarding(selected);
    router.replace('/(tabs)');
  };

  if (step === 0) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + 36,
            paddingBottom: insets.bottom + 28,
          },
        ]}
      >
        <BrandMark size="lg" />
        <View style={styles.mid}>
          <Text style={[styles.hero, { color: colors.ink }]}>
            La tua musica,{'\n'}sotto tensione.
          </Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            Tocca un brano e parte. Playlist e gusti restano sul dispositivo.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.green, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setStep(1);
          }}
        >
          <Text style={[styles.ctaText, { color: colors.onAccent }]}>Inizia</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.rootFlat,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 10,
        },
      ]}
    >
      <View style={styles.pickerWrap}>
        <ArtistPicker
          picked={picked}
          onToggle={toggle}
          listPaddingBottom={24}
          header={
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.ink }]}>Chi ascolti?</Text>
              <Text style={[styles.pickerSub, { color: colors.muted }]}>
                Scegli {MAX_TASTE_PICKS} artisti.
              </Text>
              <Text style={[styles.counter, { color: colors.green }]}>
                {selected.length}/{MAX_TASTE_PICKS}
              </Text>
            </View>
          }
        />
      </View>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            backgroundColor: colors.background,
            borderTopColor: colors.line,
          },
        ]}
      >
        <Pressable
          style={[
            styles.cta,
            { backgroundColor: canContinue ? colors.green : colors.fog },
          ]}
          onPress={finish}
          disabled={!canContinue}
        >
          <Text
            style={[
              styles.ctaText,
              { color: canContinue ? colors.onAccent : colors.muted },
            ]}
          >
            {canContinue ? 'Entra in Lyra' : `Ancora ${MAX_TASTE_PICKS - selected.length}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'space-between',
  },
  rootFlat: {
    flex: 1,
    minHeight: 0,
  },
  pickerWrap: {
    flex: 1,
    minHeight: 0,
  },
  mid: { gap: 14 },
  hero: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '700',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  sub: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
  },
  pickerHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  pickerTitle: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '700',
    fontSize: 28,
    letterSpacing: -0.5,
  },
  pickerSub: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    lineHeight: 20,
  },
  counter: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 4,
  },
  // Normal flex footer — absolute positioning broke the web layout
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: Radius.full,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  ctaText: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '700',
    fontSize: 15,
    color: '#FFF',
  },
});
