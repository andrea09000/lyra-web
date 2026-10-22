import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Track } from '@/types/music';
import { Radius, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';
import { CoverImage } from '@/components/ui/CoverImage';
import { prefetchAudioStream } from '@/services/youtube';

type Props = {
  track: Track;
  queue?: Track[];
  width?: number;
  index?: number;
};

export function PosterTile({ track, queue, width = 140 }: Props) {
  const { colors } = useTheme();
  const { playTrack, current } = usePlayer();
  const active = current?.id === track.id;

  return (
    <Pressable
      style={({ pressed }) => [
        { width, marginRight: 14 },
        pressed && { opacity: 0.88 },
      ]}
      onPressIn={() => prefetchAudioStream(track.id)}
      onPress={() => {
        void Haptics.selectionAsync();
        playTrack(track, queue);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      <View
        style={[
          styles.artWrap,
          { width, height: width, backgroundColor: colors.fog },
        ]}
      >
        <CoverImage uri={track.thumbnail} recyclingKey={track.id} size="md" style={styles.art} />
      </View>
      <Text
        style={[styles.title, { color: active ? colors.green : colors.ink }]}
        numberOfLines={2}
      >
        {track.title}
      </Text>
      <Text style={[styles.artist, { color: colors.muted }]} numberOfLines={1}>
        {track.artist}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  artWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: 8,
  },
  art: { width: '100%', height: '100%' },
  title: {
    fontFamily: Type.uiSemi,
    fontSize: 13,
    lineHeight: 17,
  },
  artist: {
    fontFamily: Type.ui,
    fontSize: 12,
    marginTop: 2,
  },
});
