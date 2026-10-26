/**
 * Native stub — expo-image memory-disk already persists covers.
 */

export function normalizeCoverUrl(remote: string | null | undefined): string | null {
  return remote || null;
}

export async function resolveCachedCover(remote: string | null | undefined): Promise<string | null> {
  return remote || null;
}

export function peekCachedCover(remote: string | null | undefined): string | null {
  return remote || null;
}

export function prefetchCovers(
  _uris: Array<string | null | undefined>,
  _size?: 'sm' | 'md' | 'lg'
): void {}

export function prefetchTrackCovers(
  _tracks: Array<{ thumbnail?: string | null } | null | undefined>,
  _size?: 'sm' | 'md' | 'lg'
): void {}

export function prefetchArtistCovers(
  _artists: Array<{ image?: string | null; thumb?: string | null } | null | undefined>,
  _size?: 'sm' | 'md' | 'lg'
): void {}

export function warmAllCovers(_input: {
  tracks?: Array<{ thumbnail?: string | null } | null | undefined>;
  artists?: Array<{ image?: string | null; thumb?: string | null } | null | undefined>;
  uris?: Array<string | null | undefined>;
}): void {}
