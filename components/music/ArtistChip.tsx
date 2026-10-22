import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TasteArtist } from '@/types/music';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  artist: TasteArtist;
  selected: boolean;
  onToggle: (artist: TasteArtist) => void;
  size?: number;
};

/**
 * Simple RN Image (not expo-image fetch/cache) so YouTube/ggpht avatars
 * paint without CORS-blocked blob fetches that blanked the whole chip.
 */
export function ArtistChip({ artist, selected, onToggle, size = 104 }: Props) {
  const { colors } = useTheme();
  const initial = (artist.name?.trim()?.[0] || '?').toUpperCase();
  const uri = artist.image && /^https?:\/\//i.test(artist.image) ? artist.image : null;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(uri) && !imgFailed;
  const fill = artist.color || colors.fog;

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle(artist);
      }}
      style={({ pressed }) => [
        styles.wrap,
        { width: size, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: selected ? colors.green : colors.line,
            backgroundColor: fill,
            borderWidth: selected ? 3 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        {/* Letter always under image — never blank circle if CDN fails */}
        <View style={styles.letterWrap} pointerEvents="none">
          <Text
            style={[
              styles.letter,
              { color: '#FFFFFF', fontSize: Math.max(22, size * 0.34) },
            ]}
          >
            {initial}
          </Text>
        </View>
        {showImage ? (
          <Image
            source={{ uri: uri! }}
            style={styles.avatar}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : null}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  letterWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '700',
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
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    width: '100%',
  },
});
