import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MAX_TASTE_PICKS } from '@/constants/artists';
import { Radius, Spacing, Type } from '@/constants/theme';
import { BrandMark } from '@/components/ui/BrandMark';
import { ArtistPicker } from '@/components/music/ArtistPicker';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { TasteArtist } from '@/types/music';
import { loadProfile, saveProfile } from '@/services/storage';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { completeOnboarding } = useLibrary();
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Record<string, TasteArtist>>({});

  const selected = useMemo(() => Object.values(picked), [picked]);
  const canContinue = selected.length === MAX_TASTE_PICKS;
  const canStart = name.trim().length >= 2;

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

  const persistName = async () => {
    const firstName = name.trim();
    const prev = await loadProfile();
    await saveProfile({ ...prev, firstName, provider: 'none' });
  };

  const goArtists = async () => {
    if (!canStart) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await persistName();
    setStep(1);
  };

  const finish = async () => {
    if (!canContinue) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await persistName();
    await completeOnboarding(selected);
    router.replace('/(tabs)');
  };

  if (step === 0) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.root,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <BrandMark size="md" />
          <View style={styles.mid}>
            <Text style={[styles.welcome, { color: colors.ink }]}>Benvenuto</Text>
            <Text style={[styles.sub, { color: colors.muted }]}>
              Come ti chiami? Lo usiamo solo sul dispositivo.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Il tuo nome"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void goArtists()}
              style={[
                styles.input,
                {
                  color: colors.ink,
                  borderColor: colors.line,
                  backgroundColor: colors.elev2,
                },
              ]}
            />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: canStart ? colors.green : colors.fog,
                opacity: pressed && canStart ? 0.9 : 1,
              },
            ]}
            onPress={() => void goArtists()}
            disabled={!canStart}
          >
            <Text
              style={[
                styles.ctaText,
                { color: canStart ? colors.onAccent : colors.muted },
              ]}
            >
              Continua
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={canStart ? colors.onAccent : colors.muted}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      style={[
        styles.rootFlat,
        { backgroundColor: colors.background, paddingTop: insets.top + 6 },
      ]}
    >
      <ArtistPicker
        picked={picked}
        onToggle={toggle}
        header={
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: colors.ink }]}>
              Ciao{name.trim() ? `, ${name.trim()}` : ''}
            </Text>
            <Text style={[styles.pickerSub, { color: colors.muted }]}>
              Scegli {MAX_TASTE_PICKS} artisti.
            </Text>
            <Text style={[styles.counter, { color: colors.green }]}>
              {selected.length}/{MAX_TASTE_PICKS}
            </Text>
          </View>
        }
      />

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 16, backgroundColor: colors.background },
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
            {canContinue ? 'Entra in Vybe' : `Ancora ${MAX_TASTE_PICKS - selected.length}`}
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
  rootFlat: { flex: 1 },
  mid: { gap: 10, marginTop: 8 },
  welcome: {
    fontFamily: Type.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  sub: {
    fontFamily: Type.ui,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 4,
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: Type.uiMed,
    fontSize: 17,
  },
  pickerHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 4,
  },
  pickerTitle: {
    fontFamily: Type.display,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  pickerSub: {
    fontFamily: Type.ui,
    fontSize: 14,
    lineHeight: 20,
  },
  counter: {
    fontFamily: Type.uiBold,
    fontSize: 13,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
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
    fontFamily: Type.uiBold,
    fontSize: 15,
    color: '#FFF',
  },
});
