import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PosterTile } from '@/components/music/PosterTile';
import { BrandMark } from '@/components/ui/BrandMark';
import { CoverImage } from '@/components/ui/CoverImage';
import { Radius, Spacing, Type } from '@/constants/theme';
import { Track } from '@/types/music';
import { getTrending, prefetchAudioStream, searchTracks } from '@/services/youtube';
import { loadHomeFeed, saveHomeFeed } from '@/services/storage';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { usePlayer } from '@/context/PlayerContext';
import { useTopPad } from '@/hooks/useTopPad';

export default function HomeScreen() {
  const topPad = useTopPad(8);
  const router = useRouter();
  const { colors } = useTheme();
  const { ready, recent, tastes, playlists } = useLibrary();
  const { playTrack } = usePlayer();

  const [forYou, setForYou] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const tasteKey = useMemo(
    () =>
      tastes
        .slice(0, 4)
        .map((t) => t.id)
        .join('|') || 'default',
    [tastes]
  );

  const hero = forYou[0] ?? trending[0] ?? recent[0] ?? null;
  const playlistRail = useMemo(() => {
    if (playlists.length > 0) {
      return playlists.slice(0, 8).map((pl) => ({
        id: pl.id,
        title: pl.name,
        thumb: pl.coverUri || pl.tracks?.[0]?.thumbnail,
        kind: 'playlist' as const,
      }));
    }
    return forYou.slice(0, 8).map((t) => ({
      id: t.id,
      title: t.title,
      thumb: t.thumbnail,
      kind: 'track' as const,
      track: t,
    }));
  }, [playlists, forYou]);

  const artists = useMemo(() => {
    if (tastes.length) {
      return tastes.slice(0, 8).map((t) => ({
        id: t.id,
        name: t.name,
        thumb: t.image,
      }));
    }
    const seen = new Set<string>();
    const out: { id: string; name: string; thumb?: string }[] = [];
    for (const t of [...forYou, ...trending]) {
      const key = t.artist?.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: t.id, name: t.artist, thumb: t.thumbnail });
      if (out.length >= 8) break;
    }
    return out;
  }, [tastes, forYou, trending]);

  const load = useCallback(
    async (force = false) => {
      try {
        setFeedError(null);
        if (!force) {
          const cached = await loadHomeFeed(tasteKey);
          if (cached) {
            setForYou(cached.forYou);
            setTrending(cached.trending);
            return;
          }
        }

        const mixQuery =
          tastes.length > 0
            ? `${tastes
                .slice(0, 4)
                .map((t) => t.name)
                .join(' ')} mix playlist`
            : 'popular music mix 2024';

        const [mix, trend] = await Promise.all([searchTracks(mixQuery, 14), getTrending(12)]);
        setForYou(mix);
        setTrending(trend);
        if (!mix.length && !trend.length) {
          setFeedError('Nessun brano. Tira per aggiornare.');
        }
        void saveHomeFeed({
          tasteKey,
          forYou: mix,
          trending: trend,
          savedAt: Date.now(),
        });
      } catch {
        setFeedError('Home non disponibile.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tasteKey, tastes]
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        setFeedError(null);
        const cached = await loadHomeFeed(tasteKey);
        if (cancelled) return;
        if (cached) {
          setForYou(cached.forYou);
          setTrending(cached.trending);
          setLoading(false);
          return;
        }

        const mixQuery =
          tastes.length > 0
            ? `${tastes
                .slice(0, 4)
                .map((t) => t.name)
                .join(' ')} mix playlist`
            : 'popular music mix 2024';

        const [mix, trend] = await Promise.all([searchTracks(mixQuery, 14), getTrending(12)]);
        if (cancelled) return;
        setForYou(mix);
        setTrending(trend);
        if (!mix.length && !trend.length) {
          setFeedError('Nessun brano. Tira per aggiornare.');
        }
        void saveHomeFeed({
          tasteKey,
          forYou: mix,
          trending: trend,
          savedAt: Date.now(),
        });
      } catch {
        if (!cancelled) setFeedError('Home non disponibile.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tasteKey]);

  useEffect(() => {
    const hot = [...forYou.slice(0, 10), ...trending.slice(0, 6)];
    const seen = new Set<string>();
    const t = setTimeout(() => {
      for (const track of hot) {
        if (!track?.id || seen.has(track.id)) continue;
        seen.add(track.id);
        prefetchAudioStream(track.id);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [forYou, trending]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 130, paddingTop: topPad }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={colors.green}
          />
        }
      >
        <View style={styles.header}>
          <BrandMark size="hero" />
          <Text style={[styles.tagline, { color: colors.muted }]}>
            Ascolta. Tieni il filo.
          </Text>

          <Pressable
            onPress={() => router.push('/(tabs)/search')}
            style={[
              styles.search,
              { backgroundColor: colors.elev2, borderColor: colors.line },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.ink} />
            <Text style={[styles.searchPh, { color: colors.muted }]}>
              Artista, brano, album…
            </Text>
          </Pressable>
        </View>

        <View style={styles.block}>
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { color: colors.ink }]}>Le tue playlist</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {playlistRail.map((item) => (
              <Pressable
                key={item.id}
                style={styles.plCard}
                onPress={() => {
                  if (item.kind === 'playlist') router.push(`/playlist/${item.id}`);
                  else if ('track' in item && item.track) playTrack(item.track, forYou);
                }}
              >
                <CoverImage
                  uri={item.thumb}
                  recyclingKey={item.id}
                  size="md"
                  style={[styles.plArt, { backgroundColor: colors.mist }]}
                />
                <Text style={[styles.plTitle, { color: colors.ink }]} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
            {loading && playlistRail.length === 0 ? (
              <ActivityIndicator color={colors.green} style={{ marginLeft: 20 }} />
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.block}>
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { color: colors.ink }]}>Top artisti</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {artists.map((a) => (
              <Pressable
                key={a.id}
                style={styles.artist}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/search',
                    params: { q: a.name },
                  })
                }
              >
                <CoverImage
                  uri={a.thumb}
                  recyclingKey={a.id}
                  size="sm"
                  style={[styles.artistArt, { backgroundColor: colors.fog }]}
                />
                <Text style={[styles.artistName, { color: colors.ink }]} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {hero ? (
          <View style={styles.block}>
            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: colors.ink }]}>Nuove uscite per te</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
            <Pressable
              onPress={() => playTrack(hero, forYou.length ? forYou : trending)}
              style={styles.feature}
            >
              <CoverImage
                uri={hero.thumbnail}
                recyclingKey={hero.id}
                size="lg"
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['transparent', 'rgba(10,10,10,0.85)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.featureBody}>
                <Text style={[styles.featureTitle, { color: colors.ink }]} numberOfLines={2}>
                  {hero.title}
                </Text>
                <Text style={[styles.featureSub, { color: colors.muted }]} numberOfLines={1}>
                  {hero.artist}
                </Text>
              </View>
              <View style={[styles.featurePlay, { backgroundColor: colors.green }]}>
                <Ionicons
                  name="play"
                  size={20}
                  color={colors.onAccent}
                  style={{ marginLeft: 2 }}
                />
              </View>
            </Pressable>
          </View>
        ) : feedError ? (
          <Pressable
            onPress={() => {
              setLoading(true);
              void load(true);
            }}
            style={{ padding: Spacing.lg }}
          >
            <Text style={{ fontFamily: Type.uiMed, color: colors.muted }}>{feedError}</Text>
          </Pressable>
        ) : null}

        {forYou.length > 1 ? (
          <View style={styles.block}>
            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: colors.ink }]}>Consigliati</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {forYou.slice(1, 10).map((track) => (
                <PosterTile key={track.id} track={track} queue={forYou} width={140} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    gap: 12,
    marginBottom: 28,
  },
  tagline: {
    fontFamily: Type.uiMed,
    fontSize: 15,
    letterSpacing: -0.2,
    marginTop: -2,
    marginBottom: 6,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginTop: 4,
  },
  searchPh: {
    fontFamily: Type.ui,
    fontSize: 14,
  },
  block: { marginBottom: 30 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: 12,
  },
  section: {
    fontFamily: Type.display,
    fontSize: 17,
    letterSpacing: -0.6,
  },
  rail: {
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  plCard: { width: 128 },
  plArt: {
    width: 128,
    height: 128,
    borderRadius: Radius.md,
    marginBottom: 8,
  },
  plTitle: {
    fontFamily: Type.uiSemi,
    fontSize: 13,
    lineHeight: 16,
  },
  artist: {
    width: 78,
    alignItems: 'center',
    gap: 8,
  },
  artistArt: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  artistName: {
    fontFamily: Type.uiMed,
    fontSize: 11,
    textAlign: 'center',
  },
  feature: {
    marginHorizontal: Spacing.lg,
    height: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  featureBody: {
    padding: 16,
    paddingRight: 70,
    gap: 4,
  },
  featureTitle: {
    fontFamily: Type.display,
    fontSize: 20,
    letterSpacing: -0.6,
  },
  featureSub: {
    fontFamily: Type.ui,
    fontSize: 13,
  },
  featurePlay: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
