import { TasteArtist } from '@/types/music';

/** Curated seed artists — cover art from public YouTube thumbs */
function thumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Curated seed artists — verified YouTube video thumbs */
export const TASTE_ARTISTS: TasteArtist[] = [
  {
    id: 'sza',
    name: 'SZA',
    query: 'SZA Kill Bill official',
    image: thumb('MSRcC626prw'),
    color: '#2D6A4F',
  },
  {
    id: 'drake',
    name: 'Drake',
    query: 'Drake official music',
    image: thumb('xpVfcZ0ZcFM'),
    color: '#1B4332',
  },
  {
    id: 'theweeknd',
    name: 'The Weeknd',
    query: 'The Weeknd Blinding Lights official',
    image: thumb('4NRXx6U8ABQ'),
    color: '#081C15',
  },
  {
    id: 'billie',
    name: 'Billie Eilish',
    query: 'Billie Eilish bad guy official',
    image: thumb('DyDfgMOUjCI'),
    color: '#40916C',
  },
  {
    id: 'taylor',
    name: 'Taylor Swift',
    query: 'Taylor Swift Anti-Hero official',
    image: thumb('b1kbLwvqugk'),
    color: '#52B788',
  },
  {
    id: 'badbunny',
    name: 'Bad Bunny',
    query: 'Bad Bunny official',
    image: thumb('saGYMhApaH8'),
    color: '#145C38',
  },
  {
    id: 'travis',
    name: 'Travis Scott',
    query: 'Travis Scott SICKO MODE official',
    image: thumb('6ONRf7h3Mdk'),
    color: '#0B1A12',
  },
  {
    id: 'dua',
    name: 'Dua Lipa',
    query: 'Dua Lipa Levitating official',
    image: thumb('oygrmJFKYZY'),
    color: '#2D6A4F',
  },
  {
    id: 'kendrick',
    name: 'Kendrick Lamar',
    query: 'Kendrick Lamar HUMBLE official',
    image: thumb('tvTRZJ-4EyI'),
    color: '#1B4332',
  },
  {
    id: 'arctic',
    name: 'Arctic Monkeys',
    query: 'Arctic Monkeys Do I Wanna Know official',
    image: thumb('VQH8ZTgna3Q'),
    color: '#081C15',
  },
  {
    id: 'anitta',
    name: 'Anitta',
    query: 'Anitta Envolver official',
    image: thumb('hFCjGiawJi4'),
    color: '#40916C',
  },
  {
    id: 'lazza',
    name: 'Lazza',
    query: 'Lazza Cenere ufficiale',
    image: thumb('A5ab7U9RVLE'),
    color: '#145C38',
  },
  {
    id: 'blanco',
    name: 'Blanco',
    query: 'Blanco Notti In Bianco ufficiale',
    image: thumb('wppn2Via-Tk'),
    color: '#2D6A4F',
  },
  {
    id: 'mahmood',
    name: 'Mahmood',
    query: 'Mahmood Soldi ufficiale',
    image: thumb('1k8craCGpgs'),
    color: '#1B4332',
  },
  {
    id: 'ghali',
    name: 'Ghali',
    query: 'Ghali Cara Italia ufficiale',
    image: thumb('z3UCQj8EFGk'),
    color: '#52B788',
  },
  {
    id: 'queen',
    name: 'Queen',
    query: 'Queen Bohemian Rhapsody official',
    image: thumb('fJ9rUzIMcZQ'),
    color: '#081C15',
  },
  {
    id: 'radiohead',
    name: 'Radiohead',
    query: 'Radiohead Creep official',
    image: thumb('XFkzRNyygfk'),
    color: '#145C38',
  },
  {
    id: 'frank',
    name: 'Frank Ocean',
    query: 'Frank Ocean Pink White',
    image: thumb('SXHpcYneDeM'),
    color: '#2D6A4F',
  },
  {
    id: 'tyler',
    name: 'Tyler, The Creator',
    query: 'Tyler The Creator EARFQUAKE official',
    image: thumb('FUXX55WqYZs'),
    color: '#40916C',
  },
  {
    id: 'rosalia',
    name: 'Rosalía',
    query: 'Rosalia Malamente official',
    image: thumb('6oanIo_2Z4Q'),
    color: '#1B4332',
  },
  {
    id: 'fredagain',
    name: 'Fred again..',
    query: 'Fred again Danielle smile',
    image: thumb('qJ1GBL1TPLg'),
    color: '#52B788',
  },
  {
    id: 'doja',
    name: 'Doja Cat',
    query: 'Doja Cat Say So official',
    image: thumb('pok8H_KF1FA'),
    color: '#081C15',
  },
  {
    id: 'coldplay',
    name: 'Coldplay',
    query: 'Coldplay Yellow official',
    image: thumb('yKNxeF4KMsY'),
    color: '#145C38',
  },
  {
    id: 'beyonce',
    name: 'Beyoncé',
    query: 'Beyonce Crazy In Love official',
    image: thumb('ViwtNLUqkMY'),
    color: '#2D6A4F',
  },
];

export const MIN_TASTE_PICKS = 3;
export const MAX_TASTE_PICKS = 3;
