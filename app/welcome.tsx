import { useEffect, useRef } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BrandMark } from '@/components/ui/BrandMark';
import { APP_NAME, APP_TAGLINE } from '@/constants/brand';
import { APP_ORIGIN, MARKETING_ORIGIN, appEntryUrl, isMarketingHost } from '@/constants/site';
import { APP_VERSION } from '@/constants/version';
import { hideBootSplash } from '@/services/bootSplash';
import { mustInstallBeforeUse, showInstallTutorial } from '@/services/installGate';

const BG = '#070806';
const INK = '#F4F7F2';
const MUTED = '#9AA3AE';
const LINE = '#1E2228';
const BLUE = '#3B82F6';
const BLUE_DEEP = '#2563EB';
const ENTER_KEY = 'vybe-enter-app';

const FEATURES = [
  {
    icon: 'play-circle' as const,
    title: 'Parte al tocco',
    body: 'Stream diretto, senza attese inutili. Tocchi un brano e ascolti.',
  },
  {
    icon: 'library' as const,
    title: 'Libreria sul telefono',
    body: 'Preferiti, playlist e ascoltati restano sul dispositivo. Niente account obbligatorio.',
  },
  {
    icon: 'phone-portrait' as const,
    title: 'PWA, non store',
    body: 'Aggiungi alla Home e usala come un’app. Aggiornamenti automatici dal web.',
  },
  {
    icon: 'search' as const,
    title: 'Cerca e scopri',
    body: 'Brani, artisti e mix personalizzati sulla Home in base ai tuoi gusti.',
  },
  {
    icon: 'download' as const,
    title: 'Cache intelligente',
    body: 'Copertine e brani ascoltati si salvano in locale: il replay è istantaneo.',
  },
  {
    icon: 'shield-checkmark' as const,
    title: 'Privacy first',
    body: 'I tuoi gusti restano tuoi. Niente login Google obbligatorio.',
  },
];

const STEPS = [
  { n: '1', title: 'Apri Vybe', body: 'Dal browser o dalla Home Screen. Zero download dallo store.' },
  { n: '2', title: 'Scegli i gusti', body: 'Pochi artisti e la Home si personalizza da subito.' },
  { n: '3', title: 'Ascolta', body: 'Cerca, metti in coda, crea playlist. Tutto resta sul telefono.' },
];

const FAQ = [
  {
    q: 'Serve un account?',
    a: 'No. Vybe funziona subito. Nome e preferenze restano sul dispositivo.',
  },
  {
    q: 'È un’app da scaricare?',
    a: 'È una PWA: aprila dal browser e aggiungila alla Home. Si comporta come un’app nativa.',
  },
  {
    q: 'I miei dati dove stanno?',
    a: 'Playlist, preferiti e cache restano in locale. Puoi cancellarli dalle impostazioni del browser.',
  },
  {
    q: 'Funziona su iPhone e Android?',
    a: 'Sì. Safari, Chrome e browser moderni. Su iOS usa “Aggiungi a Home”.',
  },
];

function markEntered() {
  try {
    sessionStorage.setItem(ENTER_KEY, '1');
  } catch {
    // ignore
  }
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const onMarketing = isMarketingHost();
  const needsInstall = !onMarketing && mustInstallBeforeUse();
  const scrolled = useRef(false);

  useEffect(() => {
    hideBootSplash();
  }, []);

  const openApp = () => {
    // Marketing site → always open the app host
    if (onMarketing) {
      void Linking.openURL(appEntryUrl('/'));
      return;
    }
    if (needsInstall) {
      showInstallTutorial();
      return;
    }
    markEntered();
    router.replace('/');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        onScrollBeginDrag={() => {
          scrolled.current = true;
        }}
      >
        {/* Nav */}
        <View style={[styles.nav, wide && styles.navWide]}>
          <BrandMark size="md" />
          <View style={styles.navLinks}>
            {wide ? (
              <>
                <Pressable onPress={() => router.push('/privacy')}>
                  <Text style={styles.navLink}>Privacy</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/terms')}>
                  <Text style={styles.navLink}>Termini</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable onPress={openApp} style={({ pressed }) => [styles.navCta, pressed && { opacity: 0.88 }]}>
              <Text style={styles.navCtaText}>
                {needsInstall ? 'Installa' : 'Apri l’app'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Hero — one composition */}
        <View style={[styles.hero, wide && styles.heroWide]}>
          <Animated.View entering={FadeIn.duration(700)} style={styles.heroCopy}>
            <Text style={[styles.heroBrand, wide && { fontSize: 72 }]}>{APP_NAME}</Text>
            <Text style={[styles.headline, wide && { fontSize: 40, maxWidth: 560 }]}>
              La tua musica,{'\n'}senza rumore intorno.
            </Text>
            <Text style={styles.sub}>
              {needsInstall
                ? 'Dal telefono Vybe funziona solo come app sulla Home. Segui il tutorial: aggiungi a Home Screen, poi riapri da lì.'
                : onMarketing
                  ? 'Il sito racconta Vybe. L’app vive su app.vybe.com — cerca, ascolta, salva playlist a tutto schermo.'
                  : 'Cerca, ascolta, salva playlist. Tutto a schermo intero, sul dispositivo — come un’app, dal browser.'}
            </Text>
            {needsInstall ? (
              <Text style={styles.installHint}>
                Safari: Condividi → Aggiungi a Home · Chrome: menu → Installa app / Aggiungi a Home
              </Text>
            ) : onMarketing ? (
              <Text style={styles.installHint}>
                Sito: muscivyb.com · App: app.vybe.com
              </Text>
            ) : null}
            <View style={styles.ctaRow}>
              <Pressable
                onPress={openApp}
                style={({ pressed }) => [styles.ctaPrimary, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.ctaPrimaryText}>
                  {needsInstall ? 'Installa Vybe' : onMarketing ? 'Vai all’app' : 'Entra in Vybe'}
                </Text>
                <Ionicons
                  name={needsInstall ? 'download-outline' : 'arrow-forward'}
                  size={18}
                  color="#FFF"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/cookies')}
                style={({ pressed }) => [styles.ctaGhost, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.ctaGhostText}>Cookie & privacy</Text>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(120).duration(800)} style={styles.heroVisual}>
            <LinearGradient
              colors={['#0F1C33', '#070806', '#070806']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.phone}>
              <LinearGradient colors={[BLUE, BLUE_DEEP]} style={styles.phoneGlow} />
              <View style={styles.phoneInner}>
                <Text style={styles.phoneNow}>In riproduzione</Text>
                <View style={styles.phoneArt}>
                  <Image
                    source={{ uri: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' }}
                    style={styles.phoneArtImg}
                  />
                </View>
                <Text style={styles.phoneTitle} numberOfLines={1}>
                  Blinding Lights
                </Text>
                <Text style={styles.phoneArtist}>The Weeknd</Text>
                <View style={styles.phoneBarTrack}>
                  <View style={styles.phoneBarFill} />
                </View>
                <View style={styles.phoneControls}>
                  <Ionicons name="play-skip-back" size={22} color={INK} />
                  <View style={styles.phonePlay}>
                    <Ionicons name="pause" size={26} color="#FFF" />
                  </View>
                  <Ionicons name="play-skip-forward" size={22} color={INK} />
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Live strip */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.strip}>
          <Text style={styles.stripItem}>
            <Text style={styles.stripNum}>0</Text> account obbligatori
          </Text>
          <View style={styles.stripDot} />
          <Text style={styles.stripItem}>
            <Text style={styles.stripNum}>PWA</Text> installabile
          </Text>
          <View style={styles.stripDot} />
          <Text style={styles.stripItem}>
            <Text style={styles.stripNum}>v{APP_VERSION}</Text> live
          </Text>
        </Animated.View>

        {/* Problem / solution */}
        <View style={[styles.section, wide && styles.sectionWide]}>
          <Text style={styles.sectionTitle}>Basta player pieni di login e pubblicità.</Text>
          <View style={[styles.split, wide && styles.splitRow]}>
            <View style={[styles.splitCol, { borderColor: LINE }]}>
              <Text style={styles.splitLabel}>Senza Vybe</Text>
              {[
                'Account e abbonamenti per ascoltare',
                'Liste sparse su tre app diverse',
                'Buffer e attese a ogni cambio brano',
                'I tuoi gusti restano sul cloud di altri',
              ].map((t) => (
                <Text key={t} style={styles.splitBad}>
                  — {t}
                </Text>
              ))}
            </View>
            <View style={[styles.splitCol, styles.splitGood, { borderColor: BLUE }]}>
              <Text style={[styles.splitLabel, { color: BLUE }]}>Con Vybe</Text>
              {[
                'Parti subito, senza registrarti',
                'Playlist e preferiti sul telefono',
                'Kick istantaneo + cache dei brani ascoltati',
                'Privacy e controllo in locale',
              ].map((t) => (
                <Text key={t} style={styles.splitOk}>
                  + {t}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {/* Features */}
        <View style={[styles.section, wide && styles.sectionWide]}>
          <Text style={styles.sectionTitle}>Tutto quello che ti serve per ascoltare.</Text>
          <Text style={styles.sectionSub}>{APP_TAGLINE}. Niente di più, niente di meno.</Text>
          <View style={[styles.featGrid, wide && styles.featGridWide]}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.feat}>
                <Ionicons name={f.icon} size={22} color={BLUE} />
                <Text style={styles.featTitle}>{f.title}</Text>
                <Text style={styles.featBody}>{f.body}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Steps */}
        <View style={[styles.section, wide && styles.sectionWide]}>
          <Text style={styles.sectionTitle}>Tre passi. Poi solo musica.</Text>
          <View style={[styles.steps, wide && styles.stepsWide]}>
            {STEPS.map((s) => (
              <View key={s.n} style={styles.step}>
                <Text style={styles.stepN}>{s.n}</Text>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* FAQ */}
        <View style={[styles.section, wide && styles.sectionWide]}>
          <Text style={styles.sectionTitle}>Domande frequenti</Text>
          <View style={styles.faq}>
            {FAQ.map((item) => (
              <View key={item.q} style={styles.faqItem}>
                <Text style={styles.faqQ}>{item.q}</Text>
                <Text style={styles.faqA}>{item.a}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom CTA */}
        <View style={styles.bottomCta}>
          <Text style={styles.bottomTitle}>
            {needsInstall
              ? 'Aggiungi alla Home.\nPoi ascolti subito.'
              : onMarketing
                ? 'Pronto?\nApri l’app Vybe.'
                : 'Riempi le cuffie.\nVybe fa il resto.'}
          </Text>
          <Pressable
            onPress={openApp}
            style={({ pressed }) => [styles.ctaPrimary, styles.ctaLarge, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.ctaPrimaryText}>
              {needsInstall ? 'Mostra tutorial' : onMarketing ? 'Apri app.vybe.com' : 'Apri Vybe'}
            </Text>
            <Ionicons
              name={needsInstall ? 'phone-portrait-outline' : 'arrow-forward'}
              size={18}
              color="#FFF"
            />
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>{APP_NAME}</Text>
          <View style={styles.footerLinks}>
            <Pressable onPress={() => router.push('/privacy')}>
              <Text style={styles.footerLink}>Privacy</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/terms')}>
              <Text style={styles.footerLink}>Termini</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/cookies')}>
              <Text style={styles.footerLink}>Cookie</Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <>
                <Pressable onPress={() => void Linking.openURL(MARKETING_ORIGIN)}>
                  <Text style={styles.footerLink}>muscivyb.com</Text>
                </Pressable>
                <Pressable onPress={() => void Linking.openURL(APP_ORIGIN)}>
                  <Text style={styles.footerLink}>app.vybe.com</Text>
                </Pressable>
              </>
            ) : null}
          </View>
          <Text style={styles.footerMeta}>© {new Date().getFullYear()} Vybe · v{APP_VERSION}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  navWide: { paddingHorizontal: 48, maxWidth: 1120, width: '100%', alignSelf: 'center' },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  navLink: { fontFamily: 'Sora_500Medium', fontSize: 13, color: MUTED },
  navCta: {
    backgroundColor: BLUE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  navCtaText: { fontFamily: 'Sora_600SemiBold', fontSize: 13, color: '#FFF' },

  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 1120,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 48,
    paddingTop: 48,
    gap: 20,
  },
  heroCopy: { flex: 1, gap: 12 },
  heroBrand: {
    fontFamily: 'Unbounded_700Bold',
    fontSize: 56,
    lineHeight: 60,
    color: INK,
    letterSpacing: -2,
  },
  headline: {
    fontFamily: 'Unbounded_600SemiBold',
    fontSize: 28,
    lineHeight: 34,
    color: INK,
    letterSpacing: -0.8,
    maxWidth: 420,
  },
  sub: {
    fontFamily: 'Sora_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: MUTED,
    maxWidth: 420,
  },
  installHint: {
    fontFamily: 'Sora_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: BLUE,
    maxWidth: 420,
  },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BLUE,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
  },
  ctaLarge: { alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 16 },
  ctaPrimaryText: { fontFamily: 'Sora_600SemiBold', fontSize: 15, color: '#FFF' },
  ctaGhost: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LINE,
  },
  ctaGhostText: { fontFamily: 'Sora_500Medium', fontSize: 14, color: MUTED },

  heroVisual: {
    flex: 1,
    minHeight: 380,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LINE,
  },
  phone: {
    width: 240,
    borderRadius: 28,
    padding: 10,
    backgroundColor: '#111418',
    borderWidth: 1,
    borderColor: '#2A313A',
  },
  phoneGlow: {
    position: 'absolute',
    top: -40,
    left: 40,
    right: 40,
    height: 120,
    borderRadius: 80,
    opacity: 0.45,
  },
  phoneInner: { gap: 10, padding: 12, alignItems: 'center' },
  phoneNow: {
    fontFamily: 'Sora_500Medium',
    fontSize: 11,
    color: MUTED,
    alignSelf: 'flex-start',
  },
  phoneArt: {
    width: 180,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A1F26',
  },
  phoneArtImg: { width: '100%', height: '100%' },
  phoneTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    color: INK,
    alignSelf: 'stretch',
  },
  phoneArtist: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    color: MUTED,
    alignSelf: 'stretch',
    marginTop: -6,
  },
  phoneBarTrack: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A313A',
    marginTop: 4,
  },
  phoneBarFill: { width: '42%', height: '100%', borderRadius: 2, backgroundColor: BLUE },
  phoneControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    marginTop: 8,
    marginBottom: 6,
  },
  phonePlay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
  },
  stripItem: { fontFamily: 'Sora_400Regular', fontSize: 13, color: MUTED },
  stripNum: { fontFamily: 'Sora_600SemiBold', color: INK },
  stripDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: LINE },

  section: { paddingHorizontal: 20, paddingTop: 56, gap: 16 },
  sectionWide: { maxWidth: 1120, width: '100%', alignSelf: 'center', paddingHorizontal: 48 },
  sectionTitle: {
    fontFamily: 'Unbounded_600SemiBold',
    fontSize: 26,
    lineHeight: 32,
    color: INK,
    letterSpacing: -0.5,
    maxWidth: 640,
  },
  sectionSub: {
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: MUTED,
    marginTop: -4,
    maxWidth: 480,
  },

  split: { gap: 14, marginTop: 8 },
  splitRow: { flexDirection: 'row' },
  splitCol: {
    flex: 1,
    gap: 10,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#0C0E11',
  },
  splitGood: { backgroundColor: 'rgba(59,130,246,0.06)' },
  splitLabel: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
    color: MUTED,
    marginBottom: 4,
  },
  splitBad: { fontFamily: 'Sora_400Regular', fontSize: 14, lineHeight: 21, color: MUTED },
  splitOk: { fontFamily: 'Sora_400Regular', fontSize: 14, lineHeight: 21, color: INK },

  featGrid: { gap: 12, marginTop: 8 },
  featGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  feat: {
    gap: 8,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#0C0E11',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 220,
    maxWidth: 360,
  },
  featTitle: { fontFamily: 'Sora_600SemiBold', fontSize: 16, color: INK },
  featBody: { fontFamily: 'Sora_400Regular', fontSize: 14, lineHeight: 21, color: MUTED },

  steps: { gap: 14, marginTop: 8 },
  stepsWide: { flexDirection: 'row' },
  step: {
    flex: 1,
    gap: 8,
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#0C0E11',
    borderWidth: 1,
    borderColor: LINE,
  },
  stepN: {
    fontFamily: 'Unbounded_700Bold',
    fontSize: 28,
    color: BLUE,
    letterSpacing: -1,
  },
  stepTitle: { fontFamily: 'Sora_600SemiBold', fontSize: 16, color: INK },
  stepBody: { fontFamily: 'Sora_400Regular', fontSize: 14, lineHeight: 21, color: MUTED },

  faq: { gap: 0, marginTop: 8, borderTopWidth: 1, borderColor: LINE },
  faqItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: LINE,
    gap: 8,
  },
  faqQ: { fontFamily: 'Sora_600SemiBold', fontSize: 15, color: INK },
  faqA: { fontFamily: 'Sora_400Regular', fontSize: 14, lineHeight: 21, color: MUTED },

  bottomCta: {
    marginTop: 56,
    marginHorizontal: 20,
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 28,
    backgroundColor: '#0C0E11',
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    gap: 20,
  },
  bottomTitle: {
    fontFamily: 'Unbounded_600SemiBold',
    fontSize: 28,
    lineHeight: 34,
    color: INK,
    textAlign: 'center',
    letterSpacing: -0.6,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 40,
    gap: 14,
    alignItems: 'center',
  },
  footerBrand: {
    fontFamily: 'Unbounded_700Bold',
    fontSize: 16,
    color: INK,
  },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  footerLink: { fontFamily: 'Sora_500Medium', fontSize: 13, color: MUTED },
  footerMeta: { fontFamily: 'Sora_400Regular', fontSize: 12, color: '#5C6570' },
});
