import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  title: string;
  subtitle?: string;
};

export function SectionHeader({ title, subtitle }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.md,
    gap: 4,
  },
  title: {
    fontFamily: Type.display,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Type.ui,
    fontSize: 13,
  },
});
