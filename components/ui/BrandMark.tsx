import { Image, StyleSheet, Text, View } from 'react-native';
import { APP_NAME } from '@/constants/brand';
import { Type } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  light?: boolean;
  spine?: boolean;
  /** Hide wordmark — logo only */
  logoOnly?: boolean;
};

const LOGO = '/logo.png';

export function BrandMark({ size = 'md', logoOnly = false }: Props) {
  const { colors } = useTheme();
  const fontSize = size === 'hero' ? 36 : size === 'lg' ? 26 : size === 'sm' ? 15 : 20;
  const disc = size === 'hero' ? 40 : size === 'lg' ? 32 : size === 'sm' ? 22 : 28;

  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel={APP_NAME}>
      <Image
        source={{ uri: LOGO }}
        style={{ width: disc, height: disc, borderRadius: disc / 2 }}
        accessibilityIgnoresInvertColors
      />
      {logoOnly ? null : (
        <Text
          style={[
            styles.word,
            {
              fontSize,
              color: colors.ink,
              letterSpacing: size === 'hero' ? -1.6 : -0.8,
            },
          ]}
        >
          {APP_NAME}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  word: {
    fontFamily: Type.brand || Type.display,
  },
});
