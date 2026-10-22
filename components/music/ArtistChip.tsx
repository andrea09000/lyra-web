import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TasteArtist } from '@/types/music';
import { useTheme } from '@/context/ThemeContext';
import { CoverImage } from '@/components/ui/CoverImage';

type Props = {
  artist: TasteArtist;
  selected: boolean;
  onToggle: (artist: TasteArtist) => void;
  size?: number;
};

export function ArtistChip({ artist, selected, onToggle, size = 104 }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle(artist);
      }}
      style={({ pressed }) => [styles.wrap, { width: size }, pressed && { opacity: 0.85 }]}
    >
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: selected ? colors.green : colors.line,
            backgroundColor: artist.color,
            borderWidth: selected ? 3 : 1,
          },
        ]}
      >
        <CoverImage uri={artist.image} recyclingKey={artist.id} size="md" style={styles.avatar} />
        {selected ? (
          <View style={[styles.check, { backgroundColor: colors.green }]}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, { color: colors.ink }]} numberOfLines={2}>
        {artist.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, alignItems: 'center' },
  frame: {
    overflow: 'hidden',
    marginBottom: 8,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  check: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'Sora_600SemiBold, system-ui, sans-serif',
    fontSize: 12,
    textAlign: 'center',
    width: '100%',
  },
});
