import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
import { TrackRow } from '@/components/music/TrackRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverImage } from '@/components/ui/CoverImage';
import { Radius, Spacing } from '@/constants/theme';
import { TasteArtist, Track } from '@/types/music';
import { prefetchCovers } from '@/services/coverCache';
import { prefetchSearchResults, searchArtists, searchTracks } from '@/services/youtube';
import { preferredArtistsForSearch, searchTracksForYou } from '@/services/tasteEngine';
import {
  clearSearchSuggestions,
  fetchSearchSuggestions,
} from '@/services/searchSuggestions';
import {
  loadRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
} from '@/services/recentSearches';
import { useLibrary } from '@/context/LibraryContext';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';
import { useTopPad } from '@/hooks/useTopPad';
import { ContentWidth } from '@/components/layout/ContentWidth';
import { useTabBottomPad } from '@/hooks/useDesktop';

type Filter = 'all' | 'songs' | 'artists';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'songs', label: 'Brani' },
  { id: 'artists', label: 'Artisti' },
];

function youtubeIdFromText(text: string): string | null {
  const m = text.trim().match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})|^([\w-]{11})$/
  );
  return m?.[1] || m?.[2] || null;
}

export default function SearchScreen() {
  const topPad = useTopPad(8);
  const bottomPad = useTabBottomPad(190);
  const { colors } = useTheme();
  const { tastes } = useLibrary();
  const { playTrack } = usePlayer();
  const params = useLocalSearchParams<{ q?: string }>();

  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [artists, setArtists] = useState<TasteArtist[]>([]);
  const [selected, setSelected] = useState<TasteArtist | null>(null);
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasteBoost, setTasteBoost] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(-1);

  const seqRef = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    void loadRecentSearches().then(setRecents);
  }, []);

  useEffect(() => {
    const q = typeof params.q === 'string' ? params.q.trim() : '';
    if (!q || bootstrapped.current) return;
    bootstrapped.current = true;
    setDraft(q);
    void runSearch(q, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  useEffect(() => {
    if (!showSuggest) return;
    if (!draft.trim()) {
      clearSearchSuggestions();
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
    fetchSearchSuggestions(draft, {
      music: filter !== 'artists',
      onResult: (list) => {
        setSuggestions(list);
        setHighlight(-1);
      },
    });
    return () => clearSearchSuggestions();
  }, [draft, filter, showSuggest]);

  const suggestRows =
    draft.trim().length >= 3 && suggestions.length
      ? suggestions
      : !draft.trim() && showSuggest
        ? recents
        : [];

  const runSearch = useCallback(
    async (raw: string, nextFilter: Filter = filter) => {
      const q = raw.trim();
      clearSearchSuggestions();
      setShowSuggest(false);
      setSuggestions([]);
      setHighlight(-1);
      inputRef.current?.blur();

      if (!q) {
        seqRef.current += 1;
        setQuery('');
        setArtists([]);
        setSelected(null);
        setResults([]);
        setTasteBoost(null);
        setLoading(false);
        setError(null);
        return;
      }

      const ytId = youtubeIdFromText(q);
      if (ytId && /^[\w-]{11}$/.test(ytId) && !/\s/.test(q.trim())) {
        const track: Track = {
          id: ytId,
          title: 'Brano',
          artist: 'YouTube',
          thumbnail: `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`,
          duration: 0,
        };
        playTrack(track, [track]);
        setDraft('');
        setQuery('');
        return;
      }

      setDraft(q);
      setQuery(q);
      setLoading(true);
      setSelected(null);
      setTasteBoost(null);
      setError(null);
      setArtists([]);
      setResults([]);

      const seq = ++seqRef.current;
      const saved = await pushRecentSearch(q);
      if (seq === seqRef.current) setRecents(saved);

      try {
        if (nextFilter === 'artists') {
          const found = await searchArtists(q, 16);
          if (seq !== seqRef.current) return;
          setArtists(found);
          setResults([]);
          setError(found.length ? null : 'Nessun artista trovato.');
          setLoading(false);
          return;
        }

        const [foundArtists, tracks] = await Promise.all([
          nextFilter === 'all' ? searchArtists(q, 8) : Promise.resolve([] as TasteArtist[]),
          searchTracksForYou(q, 30, tastes),
        ]);
        if (seq !== seqRef.current) return;

        setArtists(foundArtists);
        setResults(tracks);
        prefetchSearchResults(tracks);
        prefetchCovers(
          foundArtists.map((a) => a.image),
          'md'
        );
        setError(tracks.length || foundArtists.length ? null : 'Nessun risultato.');
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
      } catch {
        if (seq !== seqRef.current) return;
        setError('Ricerca non disponibile. Riprova.');
        setArtists([]);
        setResults([]);
        setLoading(false);
      }
    },
    [filter, playTrack, tastes]
  );

  const pickSuggestion = (text: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setDraft(text);
    void runSearch(text, filter);
  };

  const changeFilter = (next: Filter) => {
    if (next === filter) return;
    setFilter(next);
    setSelected(null);
    if (query.trim()) void runSearch(query, next);
  };

  const pickArtist = async (artist: TasteArtist) => {
    const seq = ++seqRef.current;
    setSelected(artist);
    setFilter('songs');
    setLoading(true);
    setError(null);
    setShowSuggest(false);
    setDraft(artist.name);
    setQuery(artist.name);
    try {
      const tracks = await searchTracks(`${artist.name} official audio`, 30);
      if (seq !== seqRef.current) return;
      setArtists([]);
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

  const showArtistsRail = filter === 'all' && artists.length > 0 && !selected;
  const showArtistsList = filter === 'artists' && artists.length > 0;
  const showTracks = filter !== 'artists';

  const listHeader = (
    <View>
      {showArtistsRail ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Artisti</Text>
            <Pressable onPress={() => changeFilter('artists')} hitSlop={8}>
              <Text style={[styles.sectionAction, { color: colors.green }]}>Vedi tutti</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.artistRail}
            keyboardShouldPersistTaps="handled"
          >
            {artists.map((artist) => (
              <Pressable
                key={artist.id}
                onPress={() => void pickArtist(artist)}
                style={styles.artistRailItem}
              >
                <CoverImage
                  uri={artist.image}
                  recyclingKey={artist.id}
                  size="lg"
                  style={[styles.artistAvatar, { backgroundColor: colors.elev2 }]}
                />
                <Text style={[styles.artistRailName, { color: colors.ink }]} numberOfLines={2}>
                  {artist.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showTracks && results.length > 0 && !loading ? (
        <View style={styles.sectionHeadInline}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>
            {selected ? selected.name : 'Brani'}
          </Text>
          {tasteBoost && !selected ? (
            <Text style={[styles.sectionMeta, { color: colors.muted }]}>
              prima {tasteBoost}
            </Text>
          ) : (
            <Text style={[styles.sectionMeta, { color: colors.muted }]}>
              {results.length}
            </Text>
          )}
        </View>
      ) : null}

      {loading ? <ActivityIndicator color={colors.green} style={{ marginVertical: 28 }} /> : null}

      {!loading && error && query ? (
        <EmptyState icon="cloud-offline-outline" title="Niente qui" body={error} />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <ContentWidth>
      <Text style={[styles.heading, { color: colors.ink }]}>Cerca</Text>

      <View
        style={[
          styles.fieldWrap,
          showSuggest && suggestRows.length > 0 && styles.fieldWrapOpen,
        ]}
      >
        <View
          style={[
            styles.field,
            {
              borderColor: colors.line,
              backgroundColor: colors.elev2,
              borderBottomLeftRadius:
                showSuggest && suggestRows.length > 0 ? 0 : Radius.full,
              borderBottomRightRadius:
                showSuggest && suggestRows.length > 0 ? 0 : Radius.full,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.ink} />
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setShowSuggest(true);
            }}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setShowSuggest(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => {
                setShowSuggest(false);
                setHighlight(-1);
              }, 150);
            }}
            onSubmitEditing={() => {
              const pick =
                highlight >= 0 && suggestRows[highlight]
                  ? suggestRows[highlight]
                  : draft;
              void runSearch(pick, filter);
            }}
            placeholder="Artista, brano, album…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.ink }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {draft ? (
            <Pressable
              onPress={() => {
                setDraft('');
                setQuery('');
                setResults([]);
                setArtists([]);
                setSelected(null);
                setTasteBoost(null);
                setError(null);
                setSuggestions([]);
                setShowSuggest(true);
                inputRef.current?.focus();
              }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {showSuggest && suggestRows.length > 0 ? (
          <View
            style={[
              styles.suggestBox,
              { borderColor: colors.line, backgroundColor: colors.elev2 },
            ]}
          >
            {!draft.trim() ? (
              <Text style={[styles.suggestLabel, { color: colors.muted }]}>Recenti</Text>
            ) : null}
            {suggestRows.map((item, index) => {
              const isRecent = !draft.trim();
              const active = index === highlight;
              return (
                <Pressable
                  key={`${isRecent ? 'r' : 's'}-${item}`}
                  onPress={() => pickSuggestion(item)}
                  onPressIn={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                  }}
                  style={[
                    styles.suggestRow,
                    active && { backgroundColor: colors.greenPale },
                  ]}
                >
                  <Ionicons
                    name={isRecent ? 'time-outline' : 'search-outline'}
                    size={16}
                    color={colors.muted}
                  />
                  <Text
                    style={[styles.suggestText, { color: colors.ink }]}
                    numberOfLines={1}
                  >
                    {item}
                  </Text>
                  {isRecent ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => {
                        void removeRecentSearch(item).then(setRecents);
                      }}
                    >
                      <Ionicons name="close" size={16} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Segmented Tutti / Brani / Artisti */}
      <View style={styles.segmentWrap}>
        <View style={[styles.segmentTrack, { backgroundColor: colors.elev2 }]}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => changeFilter(f.id)}
                style={[
                  styles.segmentBtn,
                  on && {
                    backgroundColor: colors.surface,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={f.label}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: on ? colors.ink : colors.muted },
                    on && styles.segmentTextOn,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!query && !loading ? (
        <EmptyState
          icon="musical-notes-outline"
          title="Cerca musica"
          body="Scrivi e scegli un suggerimento, oppure premi cerca."
        />
      ) : showArtistsList ? (
        <FlatList
          data={artists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listPad, { paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            loading ? (
              <ActivityIndicator color={colors.green} style={{ marginVertical: 28 }} />
            ) : !loading && error ? (
              <EmptyState icon="cloud-offline-outline" title="Niente qui" body={error} />
            ) : (
              <Text style={[styles.listCount, { color: colors.muted }]}>
                {artists.length} artist{artists.length === 1 ? 'a' : 'i'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void pickArtist(item)}
              style={({ pressed }) => [
                styles.artistRow,
                pressed && { opacity: 0.75 },
              ]}
            >
              <CoverImage
                uri={item.image}
                recyclingKey={item.id}
                size="md"
                style={[styles.artistRowAvatar, { backgroundColor: colors.elev2 }]}
              />
              <View style={styles.artistRowText}>
                <Text style={[styles.artistRowName, { color: colors.ink }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.artistRowKind, { color: colors.muted }]}>Artista</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={showTracks ? results : []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.listPad, { paddingBottom: bottomPad }]}
          renderItem={({ item, index }) => (
            <TrackRow track={item} queue={results} index={index} />
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
      </ContentWidth>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heading: {
    fontFamily: 'Sora_700Bold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 4,
    marginBottom: 14,
  },
  fieldWrap: {
    marginHorizontal: Spacing.lg,
    zIndex: 20,
  },
  fieldWrapOpen: {},
  field: {
    borderWidth: 1,
    borderRadius: Radius.full,
    height: 52,
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
  suggestBox: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  suggestLabel: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestText: {
    flex: 1,
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
  },
  segmentWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    paddingBottom: 8,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: Radius.full,
  },
  segmentText: {
    fontFamily: 'Sora_500Medium',
    fontSize: 14,
  },
  segmentTextOn: {
    fontFamily: 'Sora_600SemiBold',
  },
  listPad: {
    paddingHorizontal: Spacing.lg,
  },
  listCount: {
    fontFamily: 'Sora_500Medium',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
  },
  section: {
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: -Spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: 12,
  },
  sectionHeadInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  sectionAction: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  sectionMeta: {
    fontFamily: 'Sora_500Medium',
    fontSize: 13,
  },
  artistRail: {
    paddingHorizontal: Spacing.lg,
    gap: 16,
  },
  artistRailItem: {
    width: 96,
    alignItems: 'center',
  },
  artistAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 8,
  },
  artistRailName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 15,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  artistRowAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  artistRowText: {
    flex: 1,
    gap: 2,
  },
  artistRowName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
  },
  artistRowKind: {
    fontFamily: 'Sora_500Medium',
    fontSize: 13,
  },
});
