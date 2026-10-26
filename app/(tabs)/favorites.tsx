import { FlatList, StyleSheet, Text, View } from 'react-native';
import { TrackRow } from '@/components/music/TrackRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/constants/theme';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { useTopPad } from '@/hooks/useTopPad';
import { ContentWidth } from '@/components/layout/ContentWidth';
import { useTabBottomPad } from '@/hooks/useDesktop';

export default function FavoritesScreen() {
  const topPad = useTopPad(8);
  const bottomPad = useTabBottomPad(190);
  const { colors } = useTheme();
  const { favorites } = useLibrary();

  return (
    <View style={[styles.root, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <ContentWidth>
      <Text style={[styles.kicker, { color: colors.green }]}>LIKED</Text>
      <Text style={[styles.heading, { color: colors.ink }]}>Preferiti</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {favorites.length
          ? `${String(favorites.length).padStart(2, '0')} brani sul dispositivo`
          : 'I cuori restano solo qui'}
      </Text>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingBottom: bottomPad,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="Vuoto"
            body="Tocca il cuore su un brano per salvarlo."
          />
        }
        renderItem={({ item, index }) => (
          <TrackRow track={item} queue={favorites} index={index} />
        )}
      />
      </ContentWidth>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kicker: {
    paddingHorizontal: Spacing.lg,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 2,
  },
  heading: {
    fontFamily: 'Sora_700Bold',
    fontSize: 36,
    lineHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingTop: 4,
    letterSpacing: -1.2,
  },
  sub: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    paddingHorizontal: Spacing.lg,
    marginTop: 6,
    marginBottom: Spacing.lg,
  },
});
