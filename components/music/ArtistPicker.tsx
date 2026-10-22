import { useEffect, useMemo, useRef, useState } from 'react';
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
const GAP = 14;

type Props = {
  picked: Record<string, TasteArtist>;
  onToggle: (artist: TasteArtist) => void;
  header?: React.ReactNode;
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
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
}

export function ArtistPicker({
  picked,
  onToggle,
  header,
  listPaddingBottom = 120,
}: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(windowWidth || 360, 280);
  const chip = Math.max(
    72,
    Math.floor((width - Spacing.lg * 2 - GAP * (COLS - 1)) / COLS)
  );

  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<TasteArtist[]>(() => [...TASTE_ARTISTS]);
  const [remote, setRemote] = useState<TasteArtist[]>([]);
  const [hydrating, setHydrating] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    void hydrateArtistCovers(TASTE_ARTISTS, (list) => {
      if (!cancelled && list.length) setCatalog(list);
    })
      .then((list) => {
        if (!cancelled && list.length) setCatalog(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrating(false);
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
    const q = query.trim();
    const qn = norm(q);
    const pickedList = Object.values(picked);

    if (!qn) {
      const ids = new Set(catalog.map((a) => a.id));
      const extras = pickedList.filter((a) => !ids.has(a.id));
      return dedupeArtists([...extras, ...catalog]);
    }

    const localHits = [...catalog, ...pickedList].filter((a) => {
      const n = norm(a.name);
      return n.includes(qn) || qn.split(' ').every((t) => t.length < 2 || n.includes(t));
    });

    return dedupeArtists([
      ...localHits,
      ...remote,
      ...pickedList.filter((a) => norm(a.name).includes(qn)),
    ]);
  }, [query, catalog, remote, picked]);

  const rows = useMemo(() => chunkRows(data, COLS), [data]);

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
          Tocca {MAX_TASTE_PICKS} artisti · cerca per trovarne di tutti
        </Text>
      ) : searching ? (
        <Text style={[styles.hint, { color: colors.muted }]}>Cerco “{query.trim()}”…</Text>
      ) : searchError && data.length === 0 ? (
        <Text style={[styles.hint, { color: colors.danger }]}>{searchError}</Text>
      ) : (
        <Text style={[styles.hint, { color: colors.muted }]}>
          {data.length} risultat{data.length === 1 ? 'o' : 'i'} · tocca per selezionare
        </Text>
      )}

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={{ paddingBottom: listPaddingBottom, paddingTop: 4 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
      >
        {data.length === 0 ? (
          searching ? (
            <ActivityIndicator color={colors.green} style={{ marginTop: 32 }} />
          ) : (
            <Text style={[styles.empty, { color: colors.muted }]}>
              {query.trim()
                ? 'Nessun artista trovato. Prova un altro nome.'
                : 'Caricamento artisti…'}
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
              {/* Pad incomplete last row so chips stay left-aligned */}
              {row.length < COLS
                ? Array.from({ length: COLS - row.length }).map((_, i) => (
                    <View key={`pad-${i}`} style={{ width: chip }} />
                  ))
                : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  // Explicit scroll area — avoid flexWrap height:0 bug on RN Web
  scroller: { flex: 1, minHeight: 200 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: 2,
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
    fontFamily: 'system-ui, sans-serif',
    fontSize: 15,
  },
  hint: {
    paddingHorizontal: Spacing.lg,
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    paddingHorizontal: Spacing.lg,
  },
});
