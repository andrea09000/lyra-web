import { LegalScreen } from '@/components/legal/LegalScreen';
import { APP_NAME } from '@/constants/brand';

export default function CookiesScreen() {
  return (
    <LegalScreen
      title="Cookie Policy"
      updated="26 ottobre 2026"
      blocks={[
        {
          type: 'p',
          text: `${APP_NAME} usa cookie e tecnologie di memorizzazione simili (localStorage, IndexedDB, Cache Storage, Service Worker) per far funzionare l’app.`,
        },
        { type: 'h', text: '1. Cosa sono' },
        {
          type: 'p',
          text: 'I cookie sono piccoli file sul dispositivo. Tecnologie simili salvono dati in modo analogo. In una PWA gran parte dello “storage” non è un cookie HTTP classico, ma ha finalità equivalenti.',
        },
        { type: 'h', text: '2. Necessari (sempre attivi)' },
        {
          type: 'p',
          text: 'Servono al funzionamento: non puoi disattivarli senza compromettere l’app.',
        },
        { type: 'li', text: 'Memoria libreria (preferiti, playlist, recenti, gusti)' },
        { type: 'li', text: 'Cache audio e copertine per riprodurre più velocemente' },
        { type: 'li', text: 'Service Worker / installazione PWA' },
        { type: 'li', text: 'Preferenza tema e stato onboarding' },
        { type: 'li', text: 'Salvataggio della tua scelta sul banner cookie' },
        { type: 'h', text: '3. Preferenze (opzionali)' },
        {
          type: 'p',
          text: 'Se accetti le preferenze, possiamo usare storage aggiuntivo per migliorare personalizzazione futura (es. suggerimenti). Oggi non usiamo cookie pubblicitari di terze parti.',
        },
        { type: 'h', text: '4. Come gestire' },
        {
          type: 'p',
          text: 'Dal banner cookie puoi accettare tutto o solo i necessari. Puoi anche cancellare i dati del sito dalle impostazioni del browser o reinstallare la PWA.',
        },
        { type: 'h', text: '5. Durata' },
        {
          type: 'p',
          text: 'Lo storage locale resta finché non lo cancelli. Il consenso cookie è ricordato sul dispositivo fino a nuova scelta o cancellazione dati.',
        },
        { type: 'h', text: '6. Maggiori info' },
        {
          type: 'p',
          text: 'Vedi anche la Privacy Policy. Per domande: indica “Cookie Vybe” nella richiesta.',
        },
      ]}
    />
  );
}
