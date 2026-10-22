/**
 * Curated shortlist for renaming (or keeping) the product.
 * Criteria: short, sayable in IT/EN, music-adjacent without Spotify clone vibes,
 * works as a PWA wordmark, no generic “AI / stream / beat” filler.
 */
export type AppNameCandidate = {
  name: string;
  why: string;
  vibe: 'taut' | 'warm' | 'night' | 'classic';
};

export const APP_NAME_SHORTLIST: AppNameCandidate[] = [
  {
    name: 'Lyra',
    why: 'Già in uso: strumento a corde — tensione, precisione, ascolto.',
    vibe: 'taut',
  },
  {
    name: 'Cordis',
    why: 'Dal latino “corde / cuore”: intimo, elegante, musicale.',
    vibe: 'classic',
  },
  {
    name: 'Vespera',
    why: 'Sera / ascolto notturno. Soft ma distinto.',
    vibe: 'night',
  },
  {
    name: 'Nodus',
    why: 'Nodo della melodia: corto, moderno, memorabile.',
    vibe: 'taut',
  },
  {
    name: 'Solenne',
    why: 'Italiano vivo: solenne ma caldo, non freddo tech.',
    vibe: 'warm',
  },
  {
    name: 'Arco',
    why: 'Arco dell’archetto: un solo gesto, un suono.',
    vibe: 'taut',
  },
  {
    name: 'Lumen',
    why: 'Luce sul brano. Pulito, internazionale.',
    vibe: 'warm',
  },
  {
    name: 'Tesa',
    why: 'Cordà tesa — letteralmente “sotto tensione”.',
    vibe: 'taut',
  },
  {
    name: 'Mira',
    why: 'Mirino sull’ascolto: breve, femminile, forte.',
    vibe: 'taut',
  },
  {
    name: 'Orma',
    why: 'Traccia lasciata: playlist come orme.',
    vibe: 'warm',
  },
  {
    name: 'Fusa',
    why: 'Nota di musica (e calore). Molto italiano.',
    vibe: 'classic',
  },
  {
    name: 'Nero',
    why: 'Vuoto notturno + contrasto lime. Brandable.',
    vibe: 'night',
  },
];
