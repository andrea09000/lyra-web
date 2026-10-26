import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TrackRow } from '@/components/music/TrackRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverImage } from '@/components/ui/CoverImage';
import { Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { showAlert } from '@/services/alert';
import { useTopPad } from '@/hooks/useTopPad';
import { ContentWidth } from '@/components/layout/ContentWidth';
import { useTabBottomPad } from '@/hooks/useDesktop';

export default function LibraryScreen() {
  const topPad = useTopPad(8);
  const bottomPad = useTabBottomPad(190);
  const router = useRouter();
  const { colors } = useTheme();
  const { playlists, recent, createPlaylist, deletePlaylist } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const submitPlaylist = async () => {
    if (!name.trim()) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const pl = await createPlaylist(name.trim());
    setName('');
    setCreating(false);
    router.push(`/playlist/${pl.id}`);
  };

  return (
    <View style={[styles.root, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <ContentWidth>
      <View style={styles.topRow}>
        <Text style={[styles.heading, { color: colors.ink }]}>Libreria</Text>
        <View style={styles.topActions}>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.elev2, borderWidth: 1, borderColor: colors.line }]}
            onPress={() => {
              void Haptics.selectionAsync();
              router.push('/import');
            }}
          >
            <Ionicons name="cloud-download-outline" size={20} color={colors.ink} />
          </Pressable>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.green }]}
            onPress={() => {
              void Haptics.selectionAsync();
              setCreating((v) => !v);
            }}
          >
            <Ionicons name="add" size={22} color="#000000" />
          </Pressable>
        </View>
      </View>

      {creating ? (
        <View style={styles.createBox}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nome playlist"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              { backgroundColor: colors.elev2, color: colors.ink, borderColor: colors.line },
            ]}
            autoFocus
            onSubmitEditing={submitPlaylist}
          />
          <Pressable style={[styles.createCta, { backgroundColor: colors.ink }]} onPress={submitPlaylist}>
            <Text style={[styles.createCtaText, { color: colors.background }]}>Crea</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={[{ type: 'header' as const }]}
        keyExtractor={() => 'lib'}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        renderItem={() => (
          <View>
            <View style={styles.pad}>
              <Text style={[styles.section, { color: colors.muted }]}>PLAYLIST</Text>
              {playlists.length === 0 ? (
                <EmptyState
                  icon="list-outline"
                  title="Vuoto"
                  body="Crea la prima playlist con +"
                />
              ) : (
                <View style={[styles.box, { borderColor: colors.line }]}>
                  {playlists.map((pl, i) => (
                    <Pressable
                      key={pl.id}
                      style={[styles.plRow, { borderBottomColor: colors.line }]}
                      onPress={() => router.push(`/playlist/${pl.id}`)}
                      onLongPress={() => {
                        showAlert('Elimina playlist', `Vuoi eliminare “${pl.name}”?`, [
                          { text: 'Annulla', style: 'cancel' },
                          {
                            text: 'Elimina',
                            style: 'destructive',
                            onPress: () => void deletePlaylist(pl.id),
                          },
                        ]);
                      }}
                    >
                      <Text style={[styles.plIdx, { color: colors.green }]}>
                        {String(i + 1).padStart(2, '0')}
                      </Text>
                      {pl.coverUri || pl.tracks?.[0]?.thumbnail ? (
                        <CoverImage
                          uri={pl.coverUri || pl.tracks?.[0]?.thumbnail}
                          recyclingKey={pl.id}
                          size="sm"
                          style={styles.plCover}
                        />
                      ) : (
                        <View style={[styles.plCover, { backgroundColor: pl.coverColor }]} />
                      )}
                      <View style={styles.plMeta}>
                        <Text style={[styles.plName, { color: colors.ink }]}>{pl.name}</Text>
                        <Text style={[styles.plCount, { color: colors.muted }]}>
                          {pl.tracks?.length ?? pl.trackIds.length} brani
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.pad, { marginTop: Spacing.xl }]}>
              <Text style={[styles.section, { color: colors.muted }]}>CRONOLOGIA</Text>
              {recent.length === 0 ? (
                <EmptyState
                  icon="time-outline"
                  title="Nessun ascolto"
                  body="I brani riprodotti compaiono qui."
                />
              ) : (
                <View style={[styles.box, { borderColor: colors.line }]}>
                  {recent.slice(0, 20).map((track, i) => (
                    <TrackRow key={track.id} track={track} queue={recent} index={i} />
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      />
      </ContentWidth>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  heading: {
    fontFamily: 'Sora_700Bold',
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1.2,
    paddingTop: 4,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBox: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
  },
  createCta: {
    paddingHorizontal: 18,
    borderRadius: Radius.md,
    justifyContent: 'center',
  },
  createCtaText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  pad: { paddingHorizontal: Spacing.lg },
  section: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  box: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  plRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  plIdx: {
    fontFamily: 'Sora_700Bold',
    fontSize: 12,
    width: 26,
  },
  plCover: {
    width: 40,
    height: 52,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  plMeta: { flex: 1, gap: 2 },
  plName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
  },
  plCount: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
});
