import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { showAlert } from '@/services/alert';
import {
  fetchSpotifyPlaylist,
  looksLikeSpotifyLink,
  matchSpotifySongs,
  type MatchProgress,
} from '@/services/spotifyImport';

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { createPlaylistWithTracks } = useLibrary();

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'fetch' | 'match' | 'done'>('idle');
  const [progress, setProgress] = useState<MatchProgress | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const onImport = useCallback(async () => {
    const link = url.trim();
    if (!link) {
      showAlert('Link mancante', 'Incolla il link della playlist Spotify.');
      return;
    }
    if (!looksLikeSpotifyLink(link)) {
      showAlert(
        'Link non riconosciuto',
        'Serve un link open.spotify.com/playlist/… (anche album o brano).'
      );
      return;
    }

    setBusy(true);
    setPhase('fetch');
    setProgress(null);
    setStatus('Leggo la playlist su Spotify…');

    try {
      const spotify = await fetchSpotifyPlaylist(link);
      const songs = spotify.songs.slice(0, 120);
      setStatus(`Trovati ${songs.length} brani · cerco le versioni YouTube…`);
      setPhase('match');

      const { tracks, missed } = await matchSpotifySongs(songs, setProgress);

      if (!tracks.length) {
        throw new Error(
          'Nessun brano trovato su YouTube. Riprova o controlla che la playlist non sia privata.'
        );
      }

      const pl = await createPlaylistWithTracks(
        spotify.title,
        tracks,
        spotify.author
          ? `Da Spotify · ${spotify.author}${missed.length ? ` · ${missed.length} saltati` : ''}`
          : `Importata da Spotify${missed.length ? ` · ${missed.length} saltati` : ''}`
      );

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('done');
      setStatus(
        `Importata “${pl.name}”: ${tracks.length}/${songs.length} brani` +
          (missed.length ? ` (${missed.length} non trovati)` : '')
      );
      setUrl('');

      showAlert('Playlist importata', `“${pl.name}” · ${tracks.length} brani`, [
        { text: 'Resta qui', style: 'cancel' },
        {
          text: 'Apri',
          onPress: () => router.replace(`/playlist/${pl.id}`),
        },
      ]);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPhase('idle');
      setStatus(null);
      showAlert('Import fallito', String((err as Error)?.message || err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [url, createPlaylistWithTracks, router]);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : phase === 'fetch'
        ? 8
        : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: Spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.back, { borderColor: colors.line }]}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text style={[styles.kicker, { color: colors.green }]}>IMPORT</Text>
        </View>

        <Text style={[styles.heading, { color: colors.ink }]}>Da Spotify</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Incolla il link di una playlist (o album). Vybe trova i brani su YouTube e te la
          crea in Libreria.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.elev2, borderColor: colors.line }]}>
          <Text style={[styles.label, { color: colors.muted }]}>LINK SPOTIFY</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://open.spotify.com/playlist/…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            multiline
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />

          <Pressable
            onPress={() => void onImport()}
            disabled={busy || !url.trim()}
            style={[
              styles.cta,
              {
                backgroundColor: colors.green,
                opacity: busy || !url.trim() ? 0.5 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#12140F" />
            ) : (
              <Ionicons name="cloud-download-outline" size={22} color="#12140F" />
            )}
            <Text style={styles.ctaText}>{busy ? 'Import in corso…' : 'Importa playlist'}</Text>
          </Pressable>

          {busy || status ? (
            <View style={styles.progressBlock}>
              {busy ? (
                <View style={[styles.barTrack, { backgroundColor: colors.line }]}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.max(pct, 4)}%`, backgroundColor: colors.green },
                    ]}
                  />
                </View>
              ) : null}
              <Text style={[styles.status, { color: colors.muted }]}>
                {status}
                {progress
                  ? `\n${progress.done}/${progress.total} · ${progress.matched} trovati`
                  : ''}
              </Text>
              {progress?.current ? (
                <Text style={[styles.current, { color: colors.ink }]} numberOfLines={1}>
                  {progress.current}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={[styles.help, { borderColor: colors.line }]}>
          <Text style={[styles.helpTitle, { color: colors.ink }]}>Come fare</Text>
          <Text style={[styles.helpBody, { color: colors.muted }]}>
            1. Apri Spotify → playlist → Condividi → Copia link{'\n'}
            2. Incollalo qui e tocca Importa{'\n'}
            3. La playlist compare in Libreria (i brani privati/mancanti vengono saltati)
          </Text>
          <Text style={[styles.helpNote, { color: colors.muted }]}>
            La playlist deve essere pubblica. Vybe legge il link Spotify e cerca ogni
            brano su YouTube (qualche titolo può non combaciare al 100%).
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 2,
  },
  heading: {
    fontFamily: 'Sora_700Bold',
    fontSize: 40,
    letterSpacing: -1.4,
    marginBottom: 10,
  },
  lead: {
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: 16,
    gap: 12,
  },
  label: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: 14,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  cta: {
    height: 52,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 15,
    color: '#12140F',
  },
  progressBlock: { gap: 8, marginTop: 4 },
  barTrack: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 99 },
  status: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  current: {
    fontFamily: 'Sora_500Medium',
    fontSize: 12,
  },
  help: {
    marginTop: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    gap: 10,
  },
  helpTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
  },
  helpBody: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  helpNote: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.85,
  },
});
