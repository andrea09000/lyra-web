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
import {
  useDesktop,
  DESKTOP_SIDEBAR_WIDTH,
  DESKTOP_PLAYER_HEIGHT,
} from '@/hooks/useDesktop';

export function MiniPlayer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const { colors, isDark } = useTheme();
  const { current, playing, loading, error, togglePlay, playNext, playPrev } = usePlayer();

  if (!current) return null;

  if (desktop) {
    return (
      <View
        style={[
          styles.deskWrap,
          {
            left: DESKTOP_SIDEBAR_WIDTH,
            height: DESKTOP_PLAYER_HEIGHT,
            borderTopColor: colors.line,
            backgroundColor: isDark ? 'rgba(16,16,16,0.94)' : 'rgba(255,255,255,0.94)',
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 36 : 48}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={styles.deskMain} onPress={() => router.push('/player')}>
          <CoverImage
            uri={current.thumbnail}
            recyclingKey={current.id}
            size="sm"
            style={styles.deskArt}
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

        <View style={styles.deskTransport}>
          <Pressable
            hitSlop={10}
            onPress={() => {
              void Haptics.selectionAsync();
              playPrev();
            }}
            style={styles.deskIcon}
          >
            <Ionicons name="play-skip-back" size={20} color={colors.ink} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              void Haptics.selectionAsync();
              togglePlay();
            }}
            style={[styles.deskPlay, { backgroundColor: colors.green }]}
          >
            <Ionicons
              name={playing || loading ? 'pause' : 'play'}
              size={22}
              color={colors.onAccent}
              style={{ marginLeft: playing || loading ? 0 : 2 }}
            />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => {
              void Haptics.selectionAsync();
              playNext();
            }}
            style={styles.deskIcon}
          >
            <Ionicons name="play-skip-forward" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.deskRight} />
      </View>
    );
  }

  // Sit just above the floating tab pill (pill ~48 + bottomGap ≤10)
  const bottom = 56 + Math.min(Math.max(insets.bottom, 4), 16);

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
  meta: { flex: 1, gap: 2, minWidth: 0 },
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
  deskWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 25,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
    overflow: 'hidden',
  },
  deskMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
    maxWidth: 360,
  },
  deskArt: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  deskTransport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  deskIcon: {
    padding: 6,
  },
  deskPlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deskRight: {
    flex: 1,
    maxWidth: 360,
  },
});
