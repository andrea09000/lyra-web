/** YouTube thumb that prefers smaller CDN sizes when we only have a video id URL. */
export function optimizeThumbUrl(
  uri: string | null | undefined,
  size: 'sm' | 'md' | 'lg' = 'md'
): string | null {
  if (!uri) return null;
  const m = uri.match(/\/vi\/([^/]+)\//);
  if (m?.[1]) {
    const id = m[1];
    if (size === 'sm') return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    if (size === 'lg') return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return uri
    .replace('/maxresdefault.jpg', '/hqdefault.jpg')
    .replace('/sddefault.jpg', '/mqdefault.jpg');
}

export function fallbackThumbUrl(uri: string | null, current: string | null): string | null {
  if (!uri) return null;
  const m = uri.match(/\/vi\/([^/]+)\//);
  if (!m?.[1]) return null;
  const id = m[1];
  const chain = [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/default.jpg`,
  ];
  const idx = current ? chain.indexOf(current) : -1;
  return chain[idx + 1] || null;
}
