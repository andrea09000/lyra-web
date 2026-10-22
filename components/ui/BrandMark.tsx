import { StyleSheet, Text, View } from 'react-native';
import { Type } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  light?: boolean;
  spine?: boolean;
};

export function BrandMark({ size = 'md' }: Props) {
  const { colors } = useTheme();
  const fontSize = size === 'hero' ? 44 : size === 'lg' ? 30 : size === 'sm' ? 15 : 22;

  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Lyra">
      <View style={[styles.wire, { backgroundColor: colors.green }]} />
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
        Lyra
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  /** Single taut string mark */
  wire: {
    width: 3,
    height: 22,
    borderRadius: 1,
  },
  word: {
    fontFamily: Type.brand || Type.display,
  },
});
