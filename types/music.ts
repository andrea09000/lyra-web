export type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  viewCount?: number;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  /** Full track payloads so playlist songs survive reloads */
  tracks?: Track[];
  coverColor: string;
  coverUri?: string;
  backgroundUri?: string;
  createdAt: number;
};

export type Mood = {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  gradient: [string, string];
};

export type TasteArtist = {
  id: string;
  name: string;
  query: string;
  image: string;
  color: string;
};

export type LibraryState = {
  favorites: Track[];
  recent: Track[];
  playlists: Playlist[];
  onboardingDone: boolean;
  tastes: TasteArtist[];
};
