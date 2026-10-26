import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '@/components/ui/BrandMark';
import { useTheme } from '@/context/ThemeContext';
import { Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: '404' }} />
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <BrandMark size="md" />
        <Text style={[styles.kicker, { color: colors.green }]}>OFF GRID</Text>
        <Text style={[styles.title, { color: colors.ink }]}>Pagina assente</Text>
        <Link href="/(tabs)" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.green }]}>← TORNA A VYBE</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: 10,
  },
  kicker: {
    fontFamily: 'Sora_700Bold',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 20,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 36,
    letterSpacing: -1,
  },
  link: { marginTop: 16 },
  linkText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
});
