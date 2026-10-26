import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CoverImage } from '@/components/ui/CoverImage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing, Type } from '@/constants/theme';
import { SeekBar } from '@/components/music/SeekBar';
import { usePlayer } from '@/context/PlayerContext';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { useAddToPlaylist } from '@/hooks/useAddToPlaylist';
import { formatDuration } from '@/services/youtube';
import { useDesktop } from '@/hooks/useDesktop';

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const {
    current,
    playing,
    loading,
    error,
    shuffle,
    repeat,
    position,
    duration,
    togglePlay,
    playNext,
    playPrev,
    toggleShuffle,
    toggleRepeat,
    seekTo,
  } = usePlayer();
  const { isFavorite, toggleFav } = useLibrary();
  const { addTrackToPlaylist } = useAddToPlaylist();
  const [scrub, setScrub] = useState<number | null>(null);
  const desktop = useDesktop();

  if (!current) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.empty, { color: colors.muted }]}>Nessun brano</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.green }]}>Chiudi</Text>
        </Pressable>
      </View>
    );
  }

  const total = duration > 0 ? duration : current.duration || 0;
  const shown = scrub ?? position;
  const fav = isFavorite(current.id);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <CoverImage uri={current.thumbnail} recyclingKey={current.id} size="lg" style={styles.bg} />
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(7,7,7,0.35)', 'rgba(7,7,7,0.78)', '#070707']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.inner,
          desktop && styles.innerDesktop,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={[styles.playlist, { color: colors.ink }]} numberOfLines={1}>
            In riproduzione
          </Text>
          <Pressable onPress={() => addTrackToPlaylist(current)} hitSlop={12}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={[styles.body, desktop && styles.bodyDesktop]}>
          <View style={[styles.stage, desktop && styles.stageDesktop]}>
            <CoverImage
              uri={current.thumbnail}
              recyclingKey={current.id}
              size="lg"
              style={[styles.art, desktop && styles.artDesktop]}
            />
          </View>

          <View style={[styles.controlsCol, desktop && styles.controlsColDesktop]}>
            <View style={styles.meta}>
              <Text
                style={[styles.title, desktop && styles.titleDesktop, { color: colors.ink }]}
                numberOfLines={2}
              >
                {current.title}
              </Text>
              <View style={styles.artistRow}>
                <Text style={[styles.artist, { color: colors.muted }]} numberOfLines={1}>
                  {current.artist}
                </Text>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
              </View>
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
              ) : null}
            </View>

            <View style={styles.seekBlock}>
              <SeekBar
                position={shown}
                duration={total}
                onScrub={setScrub}
                onSeek={(seconds) => {
                  setScrub(null);
                  void Haptics.selectionAsync();
                  seekTo(seconds);
                }}
              />
              <View style={styles.times}>
                <Text style={[styles.time, { color: colors.muted }]}>
                  {formatDuration(Math.floor(shown))}
                </Text>
                <Text style={[styles.time, { color: colors.muted }]}>
                  -{formatDuration(Math.max(0, Math.floor(total - shown)))}
                </Text>
              </View>
            </View>

            <View style={styles.utilRow}>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void toggleFav(current);
                }}
              >
                <Ionicons
                  name={fav ? 'heart' : 'heart-outline'}
                  size={22}
                  color={fav ? colors.green : colors.ink}
                />
              </Pressable>
            </View>

            <View style={[styles.tray, { backgroundColor: 'rgba(22,22,22,0.75)' }]}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.transport}>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    toggleShuffle();
                  }}
                >
                  <Ionicons
                    name="shuffle"
                    size={20}
                    color={shuffle ? colors.green : colors.muted}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    playPrev();
                  }}
                >
                  <Ionicons name="play-skip-back" size={28} color={colors.ink} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    togglePlay();
                  }}
                  style={[styles.play, { backgroundColor: colors.green }]}
                >
                  <Ionicons
                    name={playing || loading ? 'pause' : 'play'}
                    size={30}
                    color={colors.onAccent}
                    style={{ marginLeft: playing || loading ? 0 : 3 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    playNext();
                  }}
                >
                  <Ionicons name="play-skip-forward" size={28} color={colors.ink} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    toggleRepeat();
                  }}
                >
                  <Ionicons name="repeat" size={20} color={repeat ? colors.green : colors.muted} />
                </Pressable>
              </View>
            </View>

            {!desktop ? (
              <View style={[styles.lyrics, { backgroundColor: colors.fog }]}>
                <View style={[styles.lyricsHandle, { backgroundColor: colors.line }]} />
                <Text style={[styles.lyricsText, { color: colors.muted }]}>Testi disponibili</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { fontFamily: Type.ui, fontSize: 15 },
  link: { fontFamily: Type.uiSemi, fontSize: 15 },
  bg: { ...StyleSheet.absoluteFill, opacity: 0.75 },
  inner: { flex: 1, paddingHorizontal: Spacing.lg },
  innerDesktop: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playlist: {
    fontFamily: Type.uiSemi,
    fontSize: 14,
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  body: { flex: 1 },
  bodyDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
    paddingHorizontal: 24,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  stageDesktop: {
    flex: 1.1,
    paddingVertical: 24,
  },
  art: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 1,
    borderRadius: Radius.xl,
  },
  artDesktop: {
    maxWidth: 420,
  },
  controlsCol: {},
  controlsColDesktop: {
    flex: 1,
    maxWidth: 440,
    justifyContent: 'center',
  },
  meta: { gap: 6, marginBottom: 8 },
  title: {
    fontFamily: Type.display,
    fontSize: 24,
    letterSpacing: -0.4,
  },
  titleDesktop: {
    fontSize: 32,
    letterSpacing: -0.8,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  artist: {
    fontFamily: Type.ui,
    fontSize: 15,
  },
  error: {
    fontFamily: Type.uiMed,
    fontSize: 13,
  },
  seekBlock: { marginTop: 4 },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  time: {
    fontFamily: Type.ui,
    fontSize: 11,
  },
  utilRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
    marginVertical: 10,
  },
  tray: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyrics: {
    borderRadius: Radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  lyricsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  lyricsText: {
    fontFamily: Type.uiMed,
    fontSize: 13,
  },
});
