import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Track } from '@/types/music';
import { Radius, Type } from '@/constants/theme';
import {
  formatDuration,
  prefetchAudioStream,
  prefetchPlayResolve,
  warmAudioProxy,
} from '@/services/youtube';
import { warmScrape } from '@/services/ytScrape.web';
import { useAddToPlaylist } from '@/hooks/useAddToPlaylist';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';
import { CoverImage } from '@/components/ui/CoverImage';

type Props = {
  track: Track;
  queue?: Track[];
  showDuration?: boolean;
  onLongPress?: () => void;
  index?: number;
  hideAdd?: boolean;
  /** false = stay inside playlist/mood; default true = radio after this track */
  radio?: boolean;
};

export function TrackRow({
  track,
  queue,
  showDuration = true,
  onLongPress,
  hideAdd = false,
  radio = true,
}: Props) {
  const { colors } = useTheme();
  const { playTrack, togglePlay, current, playing } = usePlayer();
  const { addTrackToPlaylist } = useAddToPlaylist();
  const active = current?.id === track.id;

  const onActivate = () => {
    void Haptics.selectionAsync();
    // Already this track → pause/resume; otherwise start (don't restart while playing)
    if (active) togglePlay();
    else playTrack(track, queue, { radio });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      onPressIn={() => {
        // ytify: warm streamCache on press-in so tap already has URL
        warmScrape(track.id);
        prefetchPlayResolve(track.id);
        warmAudioProxy(track.id);
        prefetchAudioStream(track.id);
      }}
      onPress={onActivate}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      <CoverImage uri={track.thumbnail} recyclingKey={track.id} size="sm" style={styles.thumb} />
      <View style={styles.meta}>
        <Text
          style={[styles.title, { color: active ? colors.green : colors.ink }]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={[styles.artist, { color: colors.muted }]} numberOfLines={1}>
          {track.artist}
          {showDuration && track.duration ? ` · ${formatDuration(track.duration)}` : ''}
        </Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={onActivate}
        style={[
          styles.play,
          { backgroundColor: active && playing ? colors.green : colors.fog },
        ]}
      >
        <Ionicons
          name={active && playing ? 'pause' : 'play'}
          size={14}
          color={active && playing ? colors.onAccent : '#FFF'}
          style={{ marginLeft: active && playing ? 0 : 1 }}
        />
      </Pressable>
      {!hideAdd ? (
        <Pressable hitSlop={12} onPress={() => addTrackToPlaylist(track)} style={styles.add}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
  },
  meta: { flex: 1, gap: 3 },
  title: {
    fontFamily: Type.uiSemi,
    fontSize: 15,
  },
  artist: {
    fontFamily: Type.ui,
    fontSize: 12,
  },
  play: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: { padding: 4 },
});
