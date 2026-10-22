import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrackRow } from '@/components/music/TrackRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { HOME_SECTIONS, MOODS } from '@/constants/curated';
import { Radius, Spacing } from '@/constants/theme';
import { Track } from '@/types/music';
import { searchTracks } from '@/services/youtube';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';

export default function MoodScreen() {
  const { id, q, title } = useLocalSearchParams<{ id: string; q?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { playTrack } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const mood = useMemo(() => {
    const fromMood = MOODS.find((m) => m.id === id);
    if (fromMood) return fromMood;
    const fromSection = HOME_SECTIONS.find((s) => s.id === id);
    if (fromSection) {
      return {
        id: fromSection.id,
        title: title || fromSection.title,
        subtitle: fromSection.subtitle,
        query: q || fromSection.query,
        gradient: [colors.green, colors.greenDeep] as [string, string],
      };
    }
    return {
      id: id || 'custom',
      title: title || 'Selezione',
      subtitle: 'Da YouTube',
      query: q || 'music mix',
      gradient: [colors.green, colors.greenDeep] as [string, string],
    };
  }, [id, q, title, colors.green, colors.greenDeep]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    searchTracks(mood.query, 30)
      .then((res) => {
        if (alive) setTracks(res);
      })
      .catch(() => {
        if (alive) setTracks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mood.query]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={mood.gradient} style={[styles.hero, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color="#000000" />
        </Pressable>
        <Text style={styles.kicker}>CHANNEL</Text>
        <Text style={styles.title}>{mood.title}</Text>
        <Text style={styles.subtitle}>{mood.subtitle}</Text>
        {tracks[0] ? (
          <Pressable
            style={styles.playAll}
            onPress={() => playTrack(tracks[0], tracks, { radio: false })}
          >
            <Ionicons name="play" size={16} color="#000000" />
            <Text style={styles.playAllText}>RIPRODUCI TUTTO</Text>
          </Pressable>
        ) : null}
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: 40,
          }}
          ListEmptyComponent={
            <EmptyState
              icon="musical-notes-outline"
              title="Nessun brano"
              body="Non siamo riusciti a caricare questa selezione."
            />
          }
          renderItem={({ item, index }) => (
            <TrackRow track={item} queue={tracks} index={index} radio={false} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    backgroundColor: '#1AE0B6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  kicker: {
    fontFamily: 'Sora_700Bold',
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(7,8,6,0.7)',
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 40,
    color: '#000000',
    letterSpacing: -1.2,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    color: 'rgba(7,8,6,0.75)',
    marginTop: 6,
  },
  playAll: {
    marginTop: Spacing.lg,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  playAllText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 12,
    letterSpacing: 1,
    color: '#1AE0B6',
  },
});
