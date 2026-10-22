import * as Haptics from 'expo-haptics';
import { Track } from '@/types/music';
import { useLibrary } from '@/context/LibraryContext';
import { showAlert } from '@/services/alert';

/** Add track: 1 playlist → direct; many → picker; none → create. */
export function useAddToPlaylist() {
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();

  const addTrackToPlaylist = (track: Track) => {
    void Haptics.selectionAsync();

    if (playlists.length === 0) {
      showAlert('Nessuna playlist', 'Vuoi crearne una con questo brano?', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Crea',
          onPress: () => {
            void createPlaylist('I miei brani', track);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]);
      return;
    }

    if (playlists.length === 1) {
      const pl = playlists[0];
      void addToPlaylist(pl.id, track);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    showAlert('Aggiungi a playlist', track.title, [
      ...playlists.map((pl) => ({
        text: pl.name,
        onPress: () => {
          void addToPlaylist(pl.id, track);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      })),
      { text: 'Annulla', style: 'cancel' as const },
    ]);
  };

  return { addTrackToPlaylist };
}
