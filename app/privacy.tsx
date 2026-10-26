import { LegalScreen } from '@/components/legal/LegalScreen';
import { APP_NAME } from '@/constants/brand';
import { APP_ORIGIN, SITE_URL } from '@/constants/site';

export default function PrivacyScreen() {
  return (
    <LegalScreen
      title="Privacy Policy"
      updated="26 ottobre 2026"
      blocks={[
        {
          type: 'p',
          text: `${APP_NAME} (sito ${SITE_URL}, app ${APP_ORIGIN}) rispetta la tua privacy. Questa informativa descrive quali dati vengono trattati quando usi l’app web / PWA.`,
        },
        { type: 'h', text: '1. Titolare' },
        {
          type: 'p',
          text: `Il servizio ${APP_NAME} è fornito come applicazione web. Per richieste privacy puoi usare i contatti indicati nel sito o nelle Impostazioni dell’app, se disponibili.`,
        },
        { type: 'h', text: '2. Dati che restano sul dispositivo' },
        {
          type: 'p',
          text: 'La libreria musicale (preferiti, playlist, ascoltati di recente, gusti, profilo locale, cache audio/copertine e preferenze cookie) è salvata in locale sul tuo browser o dispositivo (local storage / IndexedDB / Cache Storage). Non è richiesto un account cloud obbligatorio.',
        },
        { type: 'li', text: 'Metadati brani e playlist che crei o importi' },
        { type: 'li', text: 'Preferenze di tema e consenso cookie' },
        { type: 'li', text: 'File audio e immagini in cache per riproduzione più rapida' },
        { type: 'h', text: '3. Dati tecnici di navigazione' },
        {
          type: 'p',
          text: 'Come ogni sito, il provider di hosting (es. Vercel) può registrare log tecnici (indirizzo IP, user-agent, orario, URL richiesti) per sicurezza, affidabilità e anti-abuso. Questi log non sono usati da Vybe per profilazione pubblicitaria.',
        },
        { type: 'h', text: '4. Contenuti musicali di terzi' },
        {
          type: 'p',
          text: 'La ricerca e lo streaming possono passare da servizi e CDN di terzi (metadati, anteprime, stream). In quel caso si applicano anche le privacy policy di quei fornitori. Vybe non vende i tuoi dati personali a terzi.',
        },
        { type: 'h', text: '5. Cookie e tecnologie simili' },
        {
          type: 'p',
          text: 'Usiamo storage tecnico necessario al funzionamento dell’app e, solo se accetti, preferenze aggiuntive. Dettagli nella Cookie Policy.',
        },
        { type: 'h', text: '6. Base giuridica (UE/SEE)' },
        {
          type: 'p',
          text: 'Trattamento basato su esecuzione del servizio richiesto (uso dell’app), legittimo interesse (sicurezza/hosting) e consenso dove richiesto (cookie non essenziali).',
        },
        { type: 'h', text: '7. Conservazione' },
        {
          type: 'p',
          text: 'I dati locali restano finché non li cancelli (Impostazioni / dati del sito del browser) o disinstalli la PWA. I log di hosting seguono le policy del provider.',
        },
        { type: 'h', text: '8. I tuoi diritti' },
        {
          type: 'p',
          text: 'Puoi accedere, rettificare o cancellare i dati locali cancellando storage del sito. Per richieste GDPR (accesso, opposizione, reclamo al Garante) contattaci indicando “Privacy Vybe”.',
        },
        { type: 'h', text: '9. Minori' },
        {
          type: 'p',
          text: 'Il servizio non è destinato a minori di 16 anni senza supervisione del genitore o tutore.',
        },
        { type: 'h', text: '10. Aggiornamenti' },
        {
          type: 'p',
          text: 'Possiamo aggiornare questa informativa. La data in cima alla pagina indica l’ultima revisione.',
        },
      ]}
    />
  );
}
