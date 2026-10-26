import { Mood } from '@/types/music';

export const MOODS: Mood[] = [
  {
    id: 'focus',
    title: 'Focus',
    subtitle: 'Concentrazione limpida',
    query: 'lofi hip hop mix study focus',
    gradient: ['#3B82F6', '#0A0A0A'],
  },
  {
    id: 'chill',
    title: 'Chill',
    subtitle: 'Sera soft',
    query: 'chill acoustic playlist',
    gradient: ['#60A5FA', '#161616'],
  },
  {
    id: 'energy',
    title: 'Energy',
    subtitle: 'Battito alto',
    query: 'upbeat dance electronic mix',
    gradient: ['#2563EB', '#0A0A0A'],
  },
  {
    id: 'soul',
    title: 'Soul',
    subtitle: 'Voce e calore',
    query: 'soul r&b classics mix',
    gradient: ['#3B82F6', '#242424'],
  },
  {
    id: 'indie',
    title: 'Indie',
    subtitle: 'Scoperte fresche',
    query: 'indie alternative mix 2024',
    gradient: ['#60A5FA', '#0A0A0A'],
  },
  {
    id: 'jazz',
    title: 'Jazz',
    subtitle: 'Notte elegante',
    query: 'smooth jazz playlist',
    gradient: ['#242424', '#3B82F6'],
  },
];

export const HOME_SECTIONS = [
  {
    id: 'trending',
    title: 'In evidenza',
    subtitle: 'Quello che sta suonando ora',
    query: 'popular music mix',
  },
  {
    id: 'italy',
    title: 'Suoni italiani',
    subtitle: 'Dal vivo e in studio',
    query: 'musica italiana hit mix',
  },
  {
    id: 'relax',
    title: 'Rilassati',
    subtitle: 'Per respirare',
    query: 'relaxing piano music',
  },
];

export const ONBOARDING_SLIDES = [
  {
    id: '1',
    title: 'La tua musica,\nsotto tensione',
    body: 'Vybe porta brani da YouTube in un’app tesa e locale: tap e parte.',
  },
  {
    id: '2',
    title: 'Cerca.\nAscolta.\nSalva.',
    body: 'Playlist, preferiti e recenti restano sul dispositivo.',
  },
  {
    id: '3',
    title: 'Tutto tuo.',
    body: 'Niente account obbligatorio.',
  },
];
