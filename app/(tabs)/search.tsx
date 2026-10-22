import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrackRow } from '@/components/music/TrackRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverImage } from '@/components/ui/CoverImage';
import { Radius, Spacing } from '@/constants/theme';
import { TasteArtist, Track } from '@/types/music';
import { prefetchSearchResults, searchArtists, searchTracks } from '@/services/youtube';
import { preferredArtistsForSearch, searchTracksForYou } from '@/services/tasteEngine';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { useTopPad } from '@/hooks/useTopPad';

export default function SearchScreen() {
  const topPad = useTopPad(6);
  const { colors } = useTheme();
  const { tastes } = useLibrary();
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<TasteArtist[]>([]);
  const [selected, setSelected] = useState<TasteArtist | null>(null);
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasteBoost, setTasteBoost] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      seqRef.current += 1;
      setArtists([]);
      setSelected(null);
      setResults([]);
      setTasteBoost(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setSelected(null);
    setTasteBoost(null);
    const seq = ++seqRef.current;
    timer.current = setTimeout(async () => {
      try {
        const [foundArtists, tracks] = await Promise.all([
          searchArtists(q, 1),
          searchTracksForYou(q, 30, tastes),
        ]);
        if (seq !== seqRef.current) return;

        const artistList = foundArtists.slice(0, 1);
        setArtists(artistList);
        setResults(tracks);
        prefetchSearchResults(tracks);
        setError(tracks.length || artistList.length ? null : 'Nessun risultato.');
        setLoading(false);

        const preferred = await preferredArtistsForSearch(tastes);
        if (seq !== seqRef.current) return;
        const head = tracks.slice(0, 6);
        const boosted = preferred.find((p) => {
          const token = p.name.toLowerCase().split(/\s+/)[0] || '';
          if (token.length < 3) return false;
          return head.some((t) => t.artist.toLowerCase().includes(token));
        });
        setTasteBoost(boosted?.name ?? null);
        // Do not auto-select artist: "Brani di X" must only show after an explicit tap
      } catch {
        if (seq !== seqRef.current) return;
        setError('Ricerca non disponibile. Riprova.');
        setArtists([]);
        setResults([]);
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, tastes]);

  const pickArtist = async (artist: TasteArtist) => {
    const seq = ++seqRef.current;
    setSelected(artist);
    setLoading(true);
    setError(null);
    try {
      const tracks = await searchTracks(`${artist.name} official audio`, 30);
      if (seq !== seqRef.current) return;
      setResults(tracks);
      prefetchSearchResults(tracks);
      setError(tracks.length ? null : 'Nessun brano per questo artista.');
    } catch {
      if (seq !== seqRef.current) return;
      setError('Ricerca non disponibile. Riprova.');
      setResults([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.ink }]}>Cerca</Text>

      <View style={[styles.field, { borderColor: colors.line, backgroundColor: colors.elev2 }]}>
        <Ionicons name="search" size={20} color={colors.ink} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Artista, brano, album…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {artists.length > 0 ? (
        <View style={styles.artistBlock}>
          <Text style={[styles.artistLabel, { color: colors.muted }]}>ARTISTI</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.artistRow}
            keyboardShouldPersistTaps="handled"
          >
            {artists.map((artist) => {
              const active = selected?.id === artist.id;
              return (
                <Pressable
                  key={artist.id}
                  onPress={() => void pickArtist(artist)}
                  style={[
                    styles.artistCard,
                    {
                      borderColor: active ? colors.green : colors.line,
                      backgroundColor: colors.elev2,
                    },
                  ]}
                >
                  <CoverImage
                    uri={artist.image}
                    recyclingKey={artist.id}
                    size="md"
                    style={styles.artistCover}
                  />
                  <Text style={[styles.artistName, { color: colors.ink }]} numberOfLines={2}>
                    {artist.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {selected && !loading ? (
        <Text style={[styles.filterHint, { color: colors.green }]}>
          Brani di {selected.name}
        </Text>
      ) : tasteBoost && !loading ? (
        <Text style={[styles.filterHint, { color: colors.green }]}>
          Prima i brani di {tasteBoost} · poi il resto
        </Text>
      ) : null}

      {loading ? <ActivityIndicator color={colors.green} style={{ marginTop: 20 }} /> : null}

      {!loading && error && query ? (
        <EmptyState icon="cloud-offline-outline" title="Niente qui" body={error} />
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 190 }}
        renderItem={({ item, index }) => (
          <TrackRow track={item} queue={results} index={index} />
        )}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heading: {
    fontFamily: 'Sora_700Bold',
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1.2,
    paddingHorizontal: Spacing.lg,
    paddingTop: 4,
    marginBottom: 18,
  },
  field: {
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderRadius: Radius.full,
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Sora_500Medium',
    fontSize: 16,
    padding: 0,
  },
  artistBlock: {
    marginTop: 20,
  },
  artistLabel: {
    paddingHorizontal: Spacing.lg,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  artistRow: {
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  artistCard: {
    width: 112,
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  artistCover: {
    width: '100%',
    height: 112,
    marginBottom: 8,
  },
  artistName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    paddingHorizontal: 8,
    lineHeight: 15,
  },
  filterHint: {
    paddingHorizontal: Spacing.lg,
    marginTop: 16,
    marginBottom: 4,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.4,
  },
});
