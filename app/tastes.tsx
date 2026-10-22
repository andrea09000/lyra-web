import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MAX_TASTE_PICKS } from '@/constants/artists';
import { ArtistPicker } from '@/components/music/ArtistPicker';
import { Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { TasteArtist } from '@/types/music';

export default function TastesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { tastes, setTastes } = useLibrary();
  const [picked, setPicked] = useState<Record<string, TasteArtist>>(() =>
    Object.fromEntries(tastes.map((t) => [t.id, t]))
  );

  const selected = useMemo(() => Object.values(picked), [picked]);
  const canSave = selected.length === MAX_TASTE_PICKS;

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

  const save = async () => {
    if (!canSave) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setTastes(selected);
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
      <ArtistPicker
        picked={picked}
        onToggle={toggle}
        header={
          <View style={styles.top}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={[styles.back, { borderColor: colors.line }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={[styles.title, { color: colors.ink }]}>I tuoi gusti</Text>
            <Text style={[styles.sub, { color: colors.muted }]}>
              Scegli i tuoi {MAX_TASTE_PICKS} preferiti. Cerca chi vuoi, non solo i suggeriti.
            </Text>
            <Text style={[styles.counter, { color: colors.green }]}>
              {selected.length}/{MAX_TASTE_PICKS} SELEZIONATI
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
          style={[styles.cta, { backgroundColor: canSave ? colors.green : colors.line }]}
          onPress={save}
          disabled={!canSave}
        >
          <Text style={[styles.ctaText, { color: canSave ? '#000000' : colors.muted }]}>
            SALVA ({selected.length})
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  back: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 36,
    letterSpacing: -1.2,
  },
  sub: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  counter: {
    fontFamily: 'Sora_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 4,
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
    paddingVertical: 18,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 14,
    letterSpacing: 1.2,
  },
});
