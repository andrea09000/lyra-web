import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';
import { CoverImage } from '@/components/ui/CoverImage';
import { Radius, Type } from '@/constants/theme';

export function MiniPlayer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { current, playing, loading, error, togglePlay } = usePlayer();

  if (!current) return null;

  const bottom = 72 + Math.max(insets.bottom - 2, 12);

  return (
    <View
      style={[
        styles.wrap,
        {
          bottom,
          borderColor: colors.line,
          backgroundColor: isDark ? 'rgba(22,22,22,0.88)' : 'rgba(255,255,255,0.9)',
        },
      ]}
    >
      <BlurView
        intensity={isDark ? 40 : 50}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <Pressable style={styles.main} onPress={() => router.push('/player')}>
        <CoverImage
          uri={current.thumbnail}
          recyclingKey={current.id}
          size="sm"
          style={styles.art}
        />
        <View style={styles.meta}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
            {current.title}
          </Text>
          <Text
            style={[styles.artist, { color: error ? colors.danger : colors.muted }]}
            numberOfLines={1}
          >
            {loading ? 'Caricamento…' : error ? error : current.artist}
          </Text>
        </View>
      </Pressable>
      <Pressable
        hitSlop={8}
        onPress={() => {
          void Haptics.selectionAsync();
          togglePlay();
        }}
        style={[styles.btn, { backgroundColor: colors.green }]}
      >
        <Ionicons
          name={playing || loading ? 'pause' : 'play'}
          size={18}
          color={colors.onAccent}
          style={{ marginLeft: playing || loading ? 0 : 2 }}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 20,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 8,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  art: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  meta: { flex: 1, gap: 2 },
  title: {
    fontFamily: Type.uiSemi,
    fontSize: 13,
  },
  artist: {
    fontFamily: Type.ui,
    fontSize: 11,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
