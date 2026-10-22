import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { Track } from '@/types/music';
import { getDb, isFirebaseConfigured } from '@/services/firebase';

/** YouTube Developer Policies III.E.4.d — max 30 calendar days for Non-Authorized API data. */
export const SEARCH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const LOCAL_PREFIX = '@lyra/yt-search-cache:';
const COLLECTION = 'ytSearchCache';

export type SearchCacheEntry = {
  query: string;
  results: Track[];
  savedAt: number;
};

const memory = new Map<string, SearchCacheEntry>();

/** Lowercase, collapse spaces — "Blinding Lights" === "blinding lights ". */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable Firestore-safe document id from a normalized query. */
export function searchCacheDocId(normalized: string): string {
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const slug = normalized.slice(0, 48).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `q_${(hash >>> 0).toString(36)}_${slug || 'empty'}`;
}

function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < SEARCH_CACHE_TTL_MS;
}

function parseEntry(raw: unknown): SearchCacheEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<SearchCacheEntry>;
  if (typeof data.query !== 'string' || !Array.isArray(data.results) || typeof data.savedAt !== 'number') {
    return null;
  }
  if (!isFresh(data.savedAt) || data.results.length === 0) return null;
  return {
    query: data.query,
    results: data.results as Track[],
    savedAt: data.savedAt,
  };
}

async function readLocal(docId: string): Promise<SearchCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LOCAL_PREFIX}${docId}`);
    if (!raw) return null;
    return parseEntry(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocal(docId: string, entry: SearchCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(`${LOCAL_PREFIX}${docId}`, JSON.stringify(entry));
  } catch {
    // ignore local write failures
  }
}

async function deleteLocal(docId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${LOCAL_PREFIX}${docId}`);
  } catch {
    // ignore
  }
}

async function readFirestore(docId: string): Promise<SearchCacheEntry | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, docId));
    if (!snap.exists()) return null;
    const entry = parseEntry(snap.data());
    if (!entry) {
      // Stale per ToS — drop it
      void deleteDoc(doc(db, COLLECTION, docId)).catch(() => undefined);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function writeFirestore(docId: string, entry: SearchCacheEntry): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION, docId), entry);
  } catch {
    // Firebase optional — search still works without shared cache
  }
}

/**
 * Lookup cached search results.
 * Order: memory → AsyncStorage → Firestore (shared across users).
 */
export async function getCachedSearch(query: string): Promise<Track[] | null> {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return null;
  const docId = searchCacheDocId(normalized);

  const mem = memory.get(docId);
  if (mem && isFresh(mem.savedAt) && mem.results.length) {
    return mem.results;
  }

  const local = await readLocal(docId);
  if (local) {
    memory.set(docId, local);
    return local.results;
  }

  if (!isFirebaseConfigured()) return null;

  const remote = await readFirestore(docId);
  if (remote) {
    memory.set(docId, remote);
    void writeLocal(docId, remote);
    return remote.results;
  }

  return null;
}

/** Persist search results locally + Firestore (TTL 30 days). */
export async function setCachedSearch(query: string, results: Track[]): Promise<void> {
  const normalized = normalizeSearchQuery(query);
  if (!normalized || results.length === 0) return;

  const entry: SearchCacheEntry = {
    query: normalized,
    results,
    savedAt: Date.now(),
  };
  const docId = searchCacheDocId(normalized);
  memory.set(docId, entry);
  await writeLocal(docId, entry);
  void writeFirestore(docId, entry);
}
