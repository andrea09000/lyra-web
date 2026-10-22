import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MAX_TASTE_PICKS, TASTE_ARTISTS } from '@/constants/artists';
import { TasteArtist } from '@/types/music';
import { hydrateArtistCovers, searchArtists } from '@/services/youtube';

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

/**
 * Web-native artist grid — RN FlatList/ScrollView layout was invisible on Expo web.
 */
export function ArtistPicker({ picked, onToggle, header, listPaddingBottom = 24 }: Props) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<TasteArtist[]>(() => [...TASTE_ARTISTS]);
  const [remote, setRemote] = useState<TasteArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [brokenImg, setBrokenImg] = useState<Record<string, boolean>>({});
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

  const hint = !query.trim()
    ? `Tocca ${MAX_TASTE_PICKS} artisti · cerca per trovarne di tutti`
    : searching
      ? `Cerco “${query.trim()}”…`
      : searchError && !data.length
        ? searchError
        : `${data.length} risultat${data.length === 1 ? 'o' : 'i'} · tocca per selezionare`;

  return (
    <div style={styles.root}>
      {header ? <div style={styles.headerSlot}>{header}</div> : null}

      <div style={styles.search}>
        <span style={styles.searchIcon} aria-hidden>
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca qualsiasi artista…"
          style={styles.input}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {searching ? <span style={styles.muted}>…</span> : null}
        {query.trim() && !searching ? (
          <button type="button" onClick={() => setQuery('')} style={styles.clearBtn} aria-label="Pulisci">
            ×
          </button>
        ) : null}
      </div>

      <div style={{ ...styles.hint, color: searchError && !data.length ? '#F87171' : '#9A9A9A' }}>
        {hint}
      </div>

      <div style={{ ...styles.grid, paddingBottom: listPaddingBottom }}>
        {data.length === 0 ? (
          <div style={styles.empty}>
            {searching ? 'Caricamento…' : query.trim() ? 'Nessun artista trovato.' : 'Caricamento…'}
          </div>
        ) : (
          data.map((artist) => {
            const selected = Boolean(picked[artist.id]);
            const initial = (artist.name?.trim()?.[0] || '?').toUpperCase();
            const showImg = Boolean(artist.image) && !brokenImg[artist.id];
            return (
              <button
                key={artist.id}
                type="button"
                onClick={() => onToggle(artist)}
                style={styles.card}
              >
                <div
                  style={{
                    ...styles.avatar,
                    borderColor: selected ? '#3B82F6' : '#2E2E2E',
                    borderWidth: selected ? 3 : 1,
                    background: artist.color || '#242424',
                  }}
                >
                  <span style={styles.letter}>{initial}</span>
                  {showImg ? (
                    <img
                      src={artist.image}
                      alt=""
                      style={styles.img}
                      onError={() => setBrokenImg((prev) => ({ ...prev, [artist.id]: true }))}
                    />
                  ) : null}
                  {selected ? <span style={styles.check}>✓</span> : null}
                </div>
                <span style={styles.name}>{artist.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    minHeight: 0,
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    background: '#0A0A0A',
    color: '#FFFFFF',
    boxSizing: 'border-box',
  },
  headerSlot: {
    color: '#FFFFFF',
  },
  search: {
    margin: '0 20px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    height: 48,
    padding: '0 14px',
    borderRadius: 999,
    border: '1px solid #2E2E2E',
    background: '#242424',
  },
  searchIcon: {
    color: '#9A9A9A',
    fontSize: 18,
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'system-ui, sans-serif',
  },
  clearBtn: {
    border: 'none',
    background: 'transparent',
    color: '#9A9A9A',
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
  },
  muted: { color: '#9A9A9A' },
  hint: {
    padding: '0 20px 12px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'system-ui, sans-serif',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px 12px',
    padding: '0 20px',
    maxWidth: 520,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    color: '#9A9A9A',
    padding: '32px 12px',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    color: '#FFFFFF',
    fontFamily: 'system-ui, sans-serif',
  },
  avatar: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: '50%',
    borderStyle: 'solid',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    position: 'absolute',
    fontSize: 28,
    fontWeight: 700,
    color: '#FFFFFF',
    zIndex: 0,
  },
  img: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 1,
  },
  check: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    background: '#3B82F6',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    zIndex: 2,
  },
  name: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.3,
    textAlign: 'center',
    color: '#FFFFFF',
    width: '100%',
    minHeight: 32,
  },
};
