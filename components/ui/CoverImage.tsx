import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  /** Prefer small thumbs in lists */
  size?: 'sm' | 'md' | 'lg';
};

/** YouTube thumb that prefers smaller CDN sizes when we only have a video id URL. */
export function optimizeThumbUrl(uri: string | null | undefined, size: 'sm' | 'md' | 'lg' = 'md'): string | null {
  if (!uri) return null;
  const m = uri.match(/\/vi\/([^/]+)\//);
  if (m?.[1]) {
    const id = m[1];
    if (size === 'sm') return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    if (size === 'lg') return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  // Prefer medium over maxres when API gave huge files
  return uri
    .replace('/maxresdefault.jpg', '/hqdefault.jpg')
    .replace('/sddefault.jpg', '/mqdefault.jpg');
}

function fallbackThumbUrl(uri: string | null, current: string | null): string | null {
  if (!uri) return null;
  const m = uri.match(/\/vi\/([^/]+)\//);
  if (!m?.[1]) return null;
  const id = m[1];
  // Cascade: hq → mq → default (must differ from current or onError never updates)
  const chain = [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/default.jpg`,
  ];
  const idx = current ? chain.indexOf(current) : -1;
  return chain[idx + 1] || null;
}

/**
 * Cached cover — disk + memory, fade-in, no blank forever.
 */
export function CoverImage({ uri, style, contentFit = 'cover', recyclingKey, size = 'md' }: Props) {
  const { colors } = useTheme();
  const primary = optimizeThumbUrl(uri, size);
  const [source, setSource] = useState<string | null>(primary);

  useEffect(() => {
    setSource(optimizeThumbUrl(uri, size));
  }, [uri, size]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.fog }, style]}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={160}
          recyclingKey={recyclingKey ?? source}
          placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          priority="high"
          onError={() => {
            const next = fallbackThumbUrl(uri ?? null, source);
            if (next) setSource(next);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
