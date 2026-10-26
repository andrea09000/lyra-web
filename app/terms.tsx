import { LegalScreen } from '@/components/legal/LegalScreen';
import { APP_NAME } from '@/constants/brand';
import { APP_ORIGIN, SITE_URL } from '@/constants/site';

export default function TermsScreen() {
  return (
    <LegalScreen
      title="Termini e condizioni"
      updated="26 ottobre 2026"
      blocks={[
        {
          type: 'p',
          text: `Usando ${APP_NAME} (sito ${SITE_URL} e app ${APP_ORIGIN}) accetti questi Termini. Se non sei d’accordo, non utilizzare il servizio.`,
        },
        { type: 'h', text: '1. Cos’è Vybe' },
        {
          type: 'p',
          text: `${APP_NAME} è un’applicazione web / PWA per cercare, organizzare e riprodurre musica (app su ${APP_ORIGIN}; sito informativo su ${SITE_URL}). La libreria personale resta sul tuo dispositivo. Non è richiesto un account Google o cloud obbligatorio.`,
        },
        { type: 'h', text: '2. Età' },
        {
          type: 'p',
          text: 'Dichiaro di avere almeno 16 anni, oppure di usare l’app sotto supervisione di un genitore/tutore.',
        },
        { type: 'h', text: '3. Uso consentito' },
        { type: 'li', text: 'Uso personale e non commerciale del player e delle playlist locali' },
        { type: 'li', text: 'Rispetto delle leggi sul diritto d’autore e dei termini dei servizi di terzi' },
        {
          type: 'li',
          text: 'Vietato abusare dell’infrastruttura (scraping aggressivo, attacchi, elusione di limiti tecnici)',
        },
        { type: 'h', text: '4. Contenuti di terzi' },
        {
          type: 'p',
          text: 'Brani, artwork e metadati possono provenire da piattaforme o CDN di terzi. Vybe non rivendica la proprietà di tali contenuti. Sei responsabile di come usi i contenuti e di eventuali diritti richiesti dai titolari.',
        },
        { type: 'h', text: '5. Disponibilità' },
        {
          type: 'p',
          text: 'Il servizio è fornito “così com’è”. Possiamo modificare, sospendere o interrompere funzioni senza preavviso. Stream e mirror di terzi possono risultare lenti o non disponibili.',
        },
        { type: 'h', text: '6. Dati locali' },
        {
          type: 'p',
          text: 'Playlist e preferiti sono sul tuo dispositivo: fai backup se ti servono. La cancellazione dei dati del browser o della PWA può eliminarli definitivamente.',
        },
        { type: 'h', text: '7. Limitazione di responsabilità' },
        {
          type: 'p',
          text: 'Nella misura massima consentita dalla legge, Vybe non è responsabile per danni indiretti, perdita di dati locali, interruzioni di streaming o azioni di terzi.',
        },
        { type: 'h', text: '8. Modifiche ai Termini' },
        {
          type: 'p',
          text: 'Possiamo aggiornare i Termini. L’uso continuato dopo la data di aggiornamento costituisce accettazione delle modifiche.',
        },
        { type: 'h', text: '9. Legge applicabile' },
        {
          type: 'p',
          text: 'Salvo norme imperative diverse, si applica la legge italiana. Foro competente secondo le norme sul consumatore, se applicabili.',
        },
      ]}
    />
  );
}
