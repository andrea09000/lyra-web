import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

export function EmptyState({ icon, title, body }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.fog }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.greenPale }]}>
        <Ionicons name={icon} size={22} color={colors.green} />
      </View>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'flex-start',
    gap: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: Type.display,
    fontSize: 18,
  },
  body: {
    fontFamily: Type.ui,
    fontSize: 13,
    lineHeight: 18,
  },
});
