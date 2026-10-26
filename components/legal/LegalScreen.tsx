import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { ContentWidth } from '@/components/layout/ContentWidth';

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'li'; text: string };

type Props = {
  title: string;
  updated: string;
  blocks: Block[];
};

export function LegalScreen({ title, updated, blocks }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ContentWidth>
        <View style={styles.top}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings'))}
            hitSlop={12}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Indietro"
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.updated, { color: colors.muted }]}>Aggiornato: {updated}</Text>
          {blocks.map((b, i) => {
            if (b.type === 'h') {
              return (
                <Text key={i} style={[styles.h, { color: colors.ink }]}>
                  {b.text}
                </Text>
              );
            }
            if (b.type === 'li') {
              return (
                <Text key={i} style={[styles.li, { color: colors.inkSoft }]}>
                  • {b.text}
                </Text>
              );
            }
            return (
              <Text key={i} style={[styles.p, { color: colors.inkSoft }]}>
                {b.text}
              </Text>
            );
          })}
        </ScrollView>
      </ContentWidth>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  back: { padding: 4 },
  title: {
    flex: 1,
    fontFamily: Type.display,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  body: {
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  updated: {
    fontFamily: Type.ui,
    fontSize: 12,
    marginBottom: 8,
  },
  h: {
    fontFamily: Type.uiBold,
    fontSize: 16,
    marginTop: 14,
    letterSpacing: -0.2,
  },
  p: {
    fontFamily: Type.ui,
    fontSize: 14,
    lineHeight: 22,
  },
  li: {
    fontFamily: Type.ui,
    fontSize: 14,
    lineHeight: 22,
    paddingLeft: 4,
  },
});
