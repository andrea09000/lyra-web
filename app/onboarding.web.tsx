import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'expo-router';
import { MAX_TASTE_PICKS } from '@/constants/artists';
import { ArtistPicker } from '@/components/music/ArtistPicker';
import { useLibrary } from '@/context/LibraryContext';
import { TasteArtist } from '@/types/music';

/**
 * Web onboarding — pure DOM layout. RN flex parents were height:0 so the
 * artist grid existed in the DOM but stayed invisible.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useLibrary();
  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<Record<string, TasteArtist>>({});

  const selected = useMemo(() => Object.values(picked), [picked]);
  const canContinue = selected.length === MAX_TASTE_PICKS;

  const toggle = (artist: TasteArtist) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[artist.id]) {
        delete next[artist.id];
        return next;
      }
      if (Object.keys(next).length >= MAX_TASTE_PICKS) return prev;
      next[artist.id] = artist;
      return next;
    });
  };

  const finish = async () => {
    if (!canContinue) return;
    await completeOnboarding(selected);
    router.replace('/(tabs)');
  };

  if (step === 0) {
    return (
      <div style={styles.welcome}>
        <div style={styles.brand}>
          <span style={styles.wire} />
          <span style={styles.brandText}>Lyra</span>
        </div>
        <div style={styles.mid}>
          <h1 style={styles.hero}>
            La tua musica,
            <br />
            sotto tensione.
          </h1>
          <p style={styles.sub}>
            Tocca un brano e parte. Playlist e gusti restano sul dispositivo.
          </p>
        </div>
        <button type="button" style={styles.cta} onClick={() => setStep(1)}>
          Inizia →
        </button>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <div style={styles.picker}>
        <ArtistPicker
          picked={picked}
          onToggle={toggle}
          listPaddingBottom={24}
          header={
            <div style={styles.pickerHeader}>
              <h1 style={styles.pickerTitle}>Chi ascolti?</h1>
              <p style={styles.pickerSub}>Scegli {MAX_TASTE_PICKS} artisti.</p>
              <p style={styles.counter}>
                {selected.length}/{MAX_TASTE_PICKS}
              </p>
            </div>
          }
        />
      </div>
      <div style={styles.footer}>
        <button
          type="button"
          style={{
            ...styles.cta,
            background: canContinue ? '#3B82F6' : '#242424',
            color: canContinue ? '#FFFFFF' : '#9A9A9A',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
          onClick={() => void finish()}
          disabled={!canContinue}
        >
          {canContinue ? 'Entra in Lyra' : `Ancora ${MAX_TASTE_PICKS - selected.length}`}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  welcome: {
    // Escape broken RN Stack parent height (often negative / 0 on web)
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    boxSizing: 'border-box',
    background: '#0A0A0A',
    color: '#FFFFFF',
    padding: '48px 24px 32px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    fontFamily: 'system-ui, sans-serif',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  wire: {
    width: 3,
    height: 22,
    borderRadius: 1,
    background: '#3B82F6',
    display: 'inline-block',
  },
  brandText: { fontSize: 30, fontWeight: 700, letterSpacing: -0.5 },
  mid: { display: 'flex', flexDirection: 'column', gap: 14 },
  hero: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: -0.8,
  },
  sub: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.45,
    color: '#9A9A9A',
    maxWidth: 320,
  },
  shell: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    boxSizing: 'border-box',
    background: '#0A0A0A',
    color: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
    overflow: 'hidden',
  },
  picker: {
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  pickerHeader: {
    padding: '16px 20px 12px',
  },
  pickerTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  pickerSub: {
    margin: '6px 0 0',
    fontSize: 14,
    color: '#9A9A9A',
  },
  counter: {
    margin: '6px 0 0',
    fontSize: 13,
    fontWeight: 700,
    color: '#3B82F6',
  },
  footer: {
    flexShrink: 0,
    padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 0px))',
    borderTop: '1px solid #2E2E2E',
    background: '#0A0A0A',
  },
  cta: {
    width: '100%',
    border: 'none',
    borderRadius: 999,
    padding: '16px 24px',
    background: '#3B82F6',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
  },
};
