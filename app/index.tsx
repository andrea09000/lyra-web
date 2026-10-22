import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BrandMark } from '@/components/ui/BrandMark';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';

export default function Gate() {
  const { ready, onboardingDone } = useLibrary();
  const { colors } = useTheme();

  if (!ready) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <BrandMark size="lg" />
        <ActivityIndicator color={colors.green} size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (!onboardingDone) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
