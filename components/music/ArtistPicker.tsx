import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MAX_TASTE_PICKS, TASTE_ARTISTS } from '@/constants/artists';
import { Radius, Spacing } from '@/constants/theme';
import { ArtistChip } from '@/components/music/ArtistChip';
import { TasteArtist } from '@/types/music';
import { hydrateArtistCovers, searchArtists } from '@/services/youtube';
import { useTheme } from '@/context/ThemeContext';

const COLS = 3;
const GAP = 12;

type Props = {
  picked: Record<string, TasteArtist>;
  onToggle: (artist: TasteArtist) => void;
  header?: ReactNode;
  listPaddingBottom?: number;
};

function norm(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeArtists(list: TasteArtist[]): TasteArtist[] {
  const out: TasteArtist[] = [];
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  for (const a of list) {
    if (!a?.id || !a?.name) continue;
    const key = norm(a.name);
    if (seenId.has(a.id) || (key && seenName.has(key))) continue;
    seenId.add(a.id);
    if (key) seenName.add(key);
    out.push(a);
  }
  return out;
}

function chunkRows<T>(list: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

export function ArtistPicker({
  picked,
  onToggle,
  header,
  listPaddingBottom = 24,
}: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(windowWidth || 360, 280);
  const chip = Math.max(
    88,
    Math.floor((width - Spacing.lg * 2 - GAP * (COLS - 1)) / COLS)
  );

  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<TasteArtist[]>(() => [...TASTE_ARTISTS]);
  const [remote, setRemote] = useState<TasteArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void hydrateArtistCovers(TASTE_ARTISTS, (list) => {
      if (!cancelled && list.length) setCatalog(list);
    })
      .then((list) => {
        if (!cancelled && list.length) setCatalog(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      seqRef.current += 1;
      setRemote([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const seq = ++seqRef.current;
    timer.current = setTimeout(async () => {
      try {
        const found = await searchArtists(q, 16);
        if (seq !== seqRef.current) return;
        setRemote(found);
        setSearchError(found.length ? null : 'Nessun artista online — prova un altro nome.');
      } catch {
        if (seq !== seqRef.current) return;
        setRemote([]);
        setSearchError('Ricerca non disponibile. Riprova.');
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const data = useMemo(() => {
    const qn = norm(query.trim());
    const pickedList = Object.values(picked);
    if (!qn) {
      const ids = new Set(catalog.map((a) => a.id));
      return dedupeArtists([...pickedList.filter((a) => !ids.has(a.id)), ...catalog]);
    }
    const localHits = [...catalog, ...pickedList].filter((a) => {
      const n = norm(a.name);
      return n.includes(qn) || qn.split(' ').every((t) => t.length < 2 || n.includes(t));
    });
    return dedupeArtists([...localHits, ...remote]);
  }, [query, catalog, remote, picked]);

  const rows = useMemo(() => chunkRows(data, COLS), [data]);

  return (
    <ScrollView
      style={styles.scroller}
      contentContainerStyle={{ paddingBottom: listPaddingBottom }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator
    >
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
        {searching ? (
          <ActivityIndicator color={colors.green} size="small" />
        ) : query.trim() ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.hint, { color: searchError && !data.length ? colors.danger : colors.muted }]}>
        {!query.trim()
          ? `Tocca ${MAX_TASTE_PICKS} artisti · cerca per trovarne di tutti`
          : searching
            ? `Cerco “${query.trim()}”…`
            : searchError && !data.length
              ? searchError
              : `${data.length} risultat${data.length === 1 ? 'o' : 'i'} · tocca per selezionare`}
      </Text>

      {data.length === 0 ? (
        searching ? (
          <ActivityIndicator color={colors.green} style={{ marginTop: 28 }} />
        ) : (
          <Text style={[styles.empty, { color: colors.muted }]}>
            {query.trim() ? 'Nessun artista trovato.' : 'Caricamento…'}
          </Text>
        )
      ) : (
        rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((item) => (
              <ArtistChip
                key={item.id}
                artist={item}
                selected={Boolean(picked[item.id])}
                onToggle={onToggle}
                size={chip}
              />
            ))}
            {row.length < COLS
              ? Array.from({ length: COLS - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={{ width: chip }} />
                ))
              : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: {
    flex: 1,
    minHeight: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
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
    fontSize: 15,
    color: '#fff',
  },
  hint: {
    paddingHorizontal: Spacing.lg,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  empty: {
    textAlign: 'center',
    marginTop: 28,
    fontSize: 14,
    paddingHorizontal: Spacing.lg,
  },
});
