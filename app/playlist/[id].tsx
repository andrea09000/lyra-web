import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrackRow } from '@/components/music/TrackRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverImage } from '@/components/ui/CoverImage';
import { Radius, Spacing } from '@/constants/theme';
import { Track } from '@/types/music';
import { showAlert } from '@/services/alert';
import { warmLibraryAudio } from '@/services/downloads';
import { searchTracksForYou } from '@/services/tasteEngine';
import { useLibrary } from '@/context/LibraryContext';
import { usePlayer } from '@/context/PlayerContext';
import { useTheme } from '@/context/ThemeContext';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const {
    playlists,
    getPlaylistTracks,
    removeFromPlaylist,
    updatePlaylist,
    addToPlaylist,
    recent,
    favorites,
    tastes,
  } = useLibrary();
  const { playTrack } = usePlayer();

  const playlist = playlists.find((p) => p.id === id);
  const tracks = playlist ? getPlaylistTracks(playlist) : [];

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (playlist) setNameDraft(playlist.name);
  }, [playlist?.id, playlist?.name]);

  // Pre-cache playlist audio so tracks chain with almost no gap
  useEffect(() => {
    if (tracks.length) warmLibraryAudio(tracks);
  }, [playlist?.id, tracks.length]);

  useEffect(() => {
    if (!adding) return;
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      searchSeq.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    timer.current = setTimeout(async () => {
      try {
        const tracks = await searchTracksForYou(q, 24, tastes);
        if (seq !== searchSeq.current) return;
        setResults(tracks);
      } catch {
        if (seq !== searchSeq.current) return;
        setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 380);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, adding, tastes]);

  const pickImage = async (kind: 'cover' | 'background') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permesso foto', 'Consenti l’accesso alla libreria per impostare la copertina.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'cover' ? [1, 1] : [9, 16],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]?.uri || !playlist) return;
    void Haptics.selectionAsync();
    if (kind === 'cover') {
      await updatePlaylist(playlist.id, { coverUri: result.assets[0].uri });
    } else {
      await updatePlaylist(playlist.id, { backgroundUri: result.assets[0].uri });
    }
  };

  const saveName = async () => {
    if (!playlist) return;
    setEditingName(false);
    const next = nameDraft.trim();
    if (!next || next === playlist.name) {
      setNameDraft(playlist.name);
      return;
    }
    await updatePlaylist(playlist.id, { name: next });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAdd = async (track: Track) => {
    if (!playlist) return;
    if (playlist.trackIds.includes(track.id)) return;
    void Haptics.selectionAsync();
    await addToPlaylist(playlist.id, track);
  };

  if (!playlist) {
    return (
      <View
        style={[
          styles.root,
          styles.center,
          { paddingTop: insets.top, backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.missing, { color: colors.muted }]}>Playlist non trovata</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.green }]}>Indietro</Text>
        </Pressable>
      </View>
    );
  }

  const cover =
    playlist.coverUri || tracks[0]?.thumbnail || null;
  const suggestions = [...favorites, ...recent]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .filter((t) => !playlist.trackIds.includes(t.id))
    .slice(0, 12);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.hero, { height: 280 + insets.top }]}>
        {playlist.backgroundUri ? (
          <Image
            source={{ uri: playlist.backgroundUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : cover ? (
          <CoverImage uri={cover} size="lg" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: playlist.coverColor }]} />
        )}
        <LinearGradient
          colors={[
            'rgba(7,8,6,0.35)',
            isDark ? 'rgba(7,8,6,0.92)' : 'rgba(247,246,241,0.96)',
          ]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.elev2 }]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => void pickImage('background')}
            style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.elev2 }]}
          >
            <Ionicons name="image-outline" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.heroBody}>
          <Pressable onPress={() => void pickImage('cover')} style={styles.coverWrap}>
            {cover ? (
              <CoverImage uri={cover} size="lg" style={styles.cover} />
            ) : (
              <View style={[styles.cover, { backgroundColor: playlist.coverColor }]}>
                <Text style={styles.coverMark}>LYRA</Text>
              </View>
            )}
            <View style={[styles.coverEdit, { backgroundColor: colors.green }]}>
              <Ionicons name="camera" size={14} color="#000000" />
            </View>
          </Pressable>

          {editingName ? (
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={saveName}
              onSubmitEditing={saveName}
              autoFocus
              style={[styles.titleInput, { color: colors.ink, borderColor: colors.green }]}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          ) : (
            <Pressable onPress={() => setEditingName(true)} style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
                {playlist.name}
              </Text>
              <Ionicons name="pencil" size={16} color={colors.muted} />
            </Pressable>
          )}

          <Text style={[styles.sub, { color: colors.muted }]}>
            {String(tracks.length).padStart(2, '0')} brani
          </Text>

          <View style={styles.actions}>
            {tracks[0] ? (
              <Pressable
                style={[styles.playAll, { backgroundColor: colors.green }]}
                onPress={() => playTrack(tracks[0], tracks, { radio: false })}
              >
                <Ionicons name="play" size={16} color="#000000" />
                <Text style={styles.playAllText}>RIPRODUCI</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.addBtn, { borderColor: colors.line, backgroundColor: colors.elev2 }]}
              onPress={() => {
                setAdding(true);
                setQuery('');
                setResults([]);
              }}
            >
              <Ionicons name="add" size={18} color={colors.ink} />
              <Text style={[styles.addBtnText, { color: colors.ink }]}>Aggiungi</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: 40,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <EmptyState
            icon="add-circle-outline"
            title="Vuota"
            body="Tocca Aggiungi per cercare e inserire brani."
          />
        }
        renderItem={({ item, index }) => (
          <View>
            <TrackRow track={item} queue={tracks} index={index} hideAdd radio={false} />
            <Pressable
              onPress={() => void removeFromPlaylist(playlist.id, item.id)}
              style={styles.remove}
            >
              <Text style={[styles.removeText, { color: colors.danger }]}>RIMUOVI</Text>
            </Pressable>
          </View>
        )}
      />

      <Modal visible={adding} animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
          <View style={styles.modalTop}>
            <Text style={[styles.modalTitle, { color: colors.ink }]}>Aggiungi brani</Text>
            <Pressable onPress={() => setAdding(false)} hitSlop={12}>
              <Text style={[styles.link, { color: colors.green }]}>Fatto</Text>
            </Pressable>
          </View>

          <View style={[styles.searchField, { borderColor: colors.line, backgroundColor: colors.elev2 }]}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Cerca titolo o artista…"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.ink }]}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching ? <ActivityIndicator color={colors.green} /> : null}
          </View>

          <FlatList
            data={query.trim() ? results : suggestions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 40 }}
            ListHeaderComponent={
              !query.trim() && suggestions.length ? (
                <Text style={[styles.suggestLabel, { color: colors.muted }]}>
                  DAI TUOI ASCOLTI
                </Text>
              ) : null
            }
            ListEmptyComponent={
              searching ? null : (
                <EmptyState
                  icon="musical-notes-outline"
                  title={query.trim() ? 'Nessun risultato' : 'Cerca un brano'}
                  body="Digita per trovare musica da aggiungere."
                />
              )
            }
            renderItem={({ item }) => {
              const inList = playlist.trackIds.includes(item.id);
              return (
                <Pressable
                  style={styles.addRow}
                  onPress={() => void handleAdd(item)}
                  disabled={inList}
                >
                  <CoverImage uri={item.thumbnail} recyclingKey={item.id} size="sm" style={styles.addThumb} />
                  <View style={styles.addMeta}>
                    <Text style={[styles.addName, { color: colors.ink }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.addArtist, { color: colors.muted }]} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.addChip,
                      {
                        backgroundColor: inList ? colors.fog : colors.green,
                      },
                    ]}
                  >
                    <Ionicons
                      name={inList ? 'checkmark' : 'add'}
                      size={16}
                      color={inList ? colors.muted : '#000000'}
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  missing: { fontFamily: 'Sora_500Medium' },
  link: { fontFamily: 'Sora_600SemiBold', fontSize: 15 },
  hero: {
    overflow: 'hidden',
    marginBottom: 4,
  },
  topBar: {
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 18,
  },
  coverWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  cover: {
    width: 118,
    height: 118,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverMark: {
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    color: '#FFF',
    letterSpacing: 2,
  },
  coverEdit: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: -0.8,
    maxWidth: 280,
  },
  titleInput: {
    fontFamily: 'Sora_700Bold',
    fontSize: 26,
    textAlign: 'center',
    borderBottomWidth: 2,
    minWidth: 200,
    paddingVertical: 4,
    letterSpacing: -0.6,
  },
  sub: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  playAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  playAllText: {
    fontFamily: 'Sora_700Bold',
    color: '#000000',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  addBtnText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  remove: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: 8,
  },
  removeText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  modal: { flex: 1 },
  modalTop: {
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    letterSpacing: -0.8,
  },
  searchField: {
    marginHorizontal: Spacing.lg,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
  },
  suggestLabel: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  addThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  addMeta: { flex: 1, gap: 2 },
  addName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
  },
  addArtist: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
  addChip: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
