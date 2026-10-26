/**
 * Product name is locked in `constants/brand.ts` as Vybe.
 * Shortlist kept for historical / design reference only.
 */
export type AppNameCandidate = {
  name: string;
  why: string;
  vibe: 'taut' | 'warm' | 'night' | 'classic';
};

export const APP_NAME_SHORTLIST: AppNameCandidate[] = [
  {
    name: 'Vybe',
    why: 'Nome scelto: vibe / groove, corto, internazionale, PWA-friendly.',
    vibe: 'taut',
  },
];
