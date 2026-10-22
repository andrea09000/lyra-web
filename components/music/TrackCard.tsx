import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Track } from '@/types/music';
import { Spacing } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';
import { CoverImage } from '@/components/ui/CoverImage';
import { prefetchAudioStream } from '@/services/youtube';

type Props = {
  track: Track;
  queue?: Track[];
  width?: number;
};

export function TrackCard({ track, queue, width = 148 }: Props) {
  const { colors } = useTheme();
  const { playTrack, current } = usePlayer();
  const active = current?.id === track.id;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.pressed,
        active && { opacity: 1 },
      ]}
      onPressIn={() => prefetchAudioStream(track.id)}
      onPress={() => {
        void Haptics.selectionAsync();
        playTrack(track, queue);
      }}
    >
      <CoverImage
        uri={track.thumbnail}
        recyclingKey={track.id}
        size="md"
        style={{ width, height: width, borderRadius: 14 }}
      />
      <View style={styles.meta}>
        <Text style={[styles.title, { color: active ? colors.green : colors.ink }]} numberOfLines={2}>
          {track.title}
        </Text>
        <Text style={[styles.artist, { color: colors.muted }]} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginRight: Spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
  meta: {
    marginTop: 10,
    gap: 2,
  },
  title: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
  },
  artist: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
});
