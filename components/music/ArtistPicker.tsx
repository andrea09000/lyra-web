import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TASTE_ARTISTS } from '@/constants/artists';
import { Radius, Spacing } from '@/constants/theme';
import { ArtistChip } from '@/components/music/ArtistChip';
import { TasteArtist } from '@/types/music';
import { hydrateArtistCovers, searchArtists } from '@/services/youtube';
import { useTheme } from '@/context/ThemeContext';

const { width } = Dimensions.get('window');
const COLS = 3;
const GAP = 14;
const CHIP = (width - Spacing.lg * 2 - GAP * (COLS - 1)) / COLS;

type Props = {
  picked: Record<string, TasteArtist>;
  onToggle: (artist: TasteArtist) => void;
  header?: React.ReactNode;
  listPaddingBottom?: number;
};

export function ArtistPicker({
  picked,
  onToggle,
  header,
  listPaddingBottom = 120,
}: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<TasteArtist[]>(TASTE_ARTISTS);
  const [results, setResults] = useState<TasteArtist[]>([]);
  const [hydrating, setHydrating] = useState(true);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    void hydrateArtistCovers(TASTE_ARTISTS, (list) => {
      if (!cancelled) setCatalog(list);
    }).then((list) => {
      if (!cancelled) {
        setCatalog(list);
        setHydrating(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      seqRef.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++seqRef.current;
    timer.current = setTimeout(async () => {
      try {
        const found = await searchArtists(q, 1);
        if (seq !== seqRef.current) return;
        setResults(found);
      } catch {
        if (seq !== seqRef.current) return;
        setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const data = useMemo(() => {
    const q = query.trim();
    if (q) return results;
    // curated first, then selected artists not in catalog (from prior search)
    const ids = new Set(catalog.map((a) => a.id));
    const extras = Object.values(picked).filter((a) => !ids.has(a.id));
    return [...extras, ...catalog];
  }, [query, results, catalog, picked]);

  return (
    <View style={styles.root}>
      {header}
      <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.elev2 }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca qualsiasi artista…"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.ink }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching || (hydrating && !query.trim()) ? (
          <ActivityIndicator color={colors.green} size="small" />
        ) : query.trim() ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {!query.trim() ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          Tutti gli artisti · cerca per trovarne altri
        </Text>
      ) : null}

      <FlatList
        style={styles.list}
        data={data}
        keyExtractor={(item) => item.id}
        numColumns={COLS}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: Spacing.lg }}
        contentContainerStyle={{ paddingBottom: listPaddingBottom, gap: 4 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          searching ? null : (
            <Text style={[styles.empty, { color: colors.muted }]}>
              {query.trim() ? 'Nessun artista trovato.' : 'Caricamento…'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ArtistChip
            artist={item}
            selected={Boolean(picked[item.id])}
            onToggle={onToggle}
            size={CHIP}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flex: 1 },
  search: {
    marginHorizontal: Spacing.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
  },
  hint: {
    paddingHorizontal: Spacing.lg,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    paddingHorizontal: Spacing.lg,
  },
});
