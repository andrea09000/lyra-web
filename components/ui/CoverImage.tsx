import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { normalizeCoverUrl, peekCachedCover, resolveCachedCover } from '@/services/coverCache';
import { fallbackThumbUrl, optimizeThumbUrl } from '@/services/thumbUrl';

export { optimizeThumbUrl } from '@/services/thumbUrl';

type Props = {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  /** Prefer small thumbs in lists */
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Cached cover — Demus/Kingfisher style: memory + disk (Cache API on web).
 */
export function CoverImage({ uri, style, contentFit = 'cover', recyclingKey, size = 'md' }: Props) {
  const { colors } = useTheme();
  const primary = (() => {
    const n = normalizeCoverUrl(uri);
    if (!n) return null;
    return n.includes('/vi/') ? optimizeThumbUrl(n, size) || n : n;
  })();
  const [source, setSource] = useState<string | null>(() => peekCachedCover(primary) || primary);

  useEffect(() => {
    const n = normalizeCoverUrl(uri);
    const optimized = n ? (n.includes('/vi/') ? optimizeThumbUrl(n, size) || n : n) : null;
    const local = peekCachedCover(optimized);
    setSource(local || optimized);
    if (!optimized) return;

    let cancelled = false;
    void resolveCachedCover(optimized).then((resolved) => {
      if (!cancelled && resolved) setSource(resolved);
    });
    return () => {
      cancelled = true;
    };
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
            // blob miss → try remote cascade; then fallback sizes
            if (source.startsWith('blob:') && primary && primary !== source) {
              setSource(primary);
              return;
            }
            const next = fallbackThumbUrl(uri ?? null, source.startsWith('blob:') ? primary : source);
            if (next) {
              setSource(next);
              void resolveCachedCover(next).then((r) => {
                if (r) setSource(r);
              });
            }
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
