/**
 * ytify-style suggestions client: debounce + AbortController + clear-on-submit.
 */

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let lastQuery = '';

function suggestionsUrl(q: string, music: boolean): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const base = origin || '';
  const path = `/api/suggestions?q=${encodeURIComponent(q)}&music=${music ? '1' : '0'}`;
  if (base) return `${base}${path}`;
  // Native / offline — relative won't work; caller should handle empty
  return path;
}

export function clearSearchSuggestions(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (controller) {
    controller.abort();
    controller = null;
  }
  lastQuery = '';
}

export function fetchSearchSuggestions(
  text: string,
  opts: {
    music?: boolean;
    debounceMs?: number;
    onResult: (suggestions: string[]) => void;
  }
): void {
  const { music = true, debounceMs = 400, onResult } = opts;
  const q = text.trim();

  if (debounceTimer) clearTimeout(debounceTimer);
  if (controller) {
    controller.abort();
    controller = null;
  }

  if (q.length < 3) {
    lastQuery = '';
    onResult([]);
    return;
  }

  if (q === lastQuery) return;

  debounceTimer = setTimeout(() => {
    lastQuery = q;
    const ac = new AbortController();
    controller = ac;

    void (async () => {
      try {
        const res = await fetch(suggestionsUrl(q, music), {
          signal: ac.signal,
          headers: { Accept: 'application/json' },
        });
        if (controller !== ac) return;
        if (!res.ok) {
          onResult([]);
          return;
        }
        const data = (await res.json()) as { suggestions?: string[] };
        if (controller !== ac) return;
        onResult(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (controller !== ac) return;
        onResult([]);
      }
    })();
  }, debounceMs);
}
