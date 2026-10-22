import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { Filament, Radius, Spacing, Type } from '@/constants/theme';
import { useLibrary } from '@/context/LibraryContext';
import { useTheme } from '@/context/ThemeContext';
import { showAlert } from '@/services/alert';
import { loadProfile, saveProfile, type UserProfile } from '@/services/storage';
import { useTopPad } from '@/hooks/useTopPad';

export default function ProfileScreen() {
  const topPad = useTopPad(10);
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { tastes, favorites, playlists } = useLibrary();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const [profile, setProfile] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    email: '',
    provider: 'none',
  });
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void loadProfile().then((p) => {
      setProfile(p);
      setReady(true);
    });
  }, []);

  const persist = useCallback((next: UserProfile) => {
    setProfile(next);
    void saveProfile(next);
  }, []);

  const patch = useCallback(
    (partial: Partial<UserProfile>) => {
      persist({ ...profile, ...partial });
    },
    [persist, profile]
  );

  const initials = [profile.firstName, profile.lastName]
    .map((s) => s.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')
    .slice(0, 2);

  const displayName =
    [profile.firstName, profile.lastName].filter((s) => s.trim()).join(' ') || 'Ascoltatore Lyra';

  const connected = profile.provider === 'google';

  const signInGoogle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAlert('Continua con Google', 'Collega l’account per tenere nome ed email sul profilo.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Continua',
        onPress: () => {
          persist({ ...profile, provider: 'google' });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEditing(true);
        },
      },
    ]);
  };

  const signOut = () => {
    showAlert('Esci', 'Disconnettere l’account?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: () => {
          persist({ ...profile, provider: 'none' });
          void Haptics.selectionAsync();
        },
      },
    ]);
  };

  const glassBg = isDark ? 'rgba(22,22,22,0.55)' : 'rgba(255,255,255,0.65)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          isDark
            ? ['#1E3A5F', '#0A0A0A', '#0A0A0A']
            : ['#BFDBFE', '#F5F5F7', '#F5F5F7']
        }
        locations={[0, 0.42, 1]}
        style={styles.heroGlow}
      />
      <View
        style={[
          styles.orb,
          {
            backgroundColor: isDark ? 'rgba(59,130,246,0.22)' : 'rgba(37,99,235,0.18)',
          },
        ]}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: topPad,
            paddingBottom: 200,
            paddingHorizontal: Spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
            <LinearGradient
              colors={isDark ? Filament.avatar : Filament.avatarLight}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={[styles.avatarInner, { backgroundColor: colors.background }]}>
                <Text style={[styles.avatarText, { color: colors.green }]}>
                  {ready ? initials || 'LY' : '·'}
                </Text>
              </View>
            </LinearGradient>

            <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
              {ready ? displayName : '…'}
            </Text>
            <Text style={[styles.status, { color: colors.muted }]}>
              {connected ? 'Account Google collegato' : 'Ascolti in locale · non collegato'}
            </Text>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setEditing((v) => !v);
              }}
              hitSlop={8}
              style={styles.editLink}
            >
              <Text style={[styles.editLinkText, { color: colors.green }]}>
                {editing ? 'Chiudi modifica' : 'Modifica profilo'}
              </Text>
            </Pressable>
          </Animated.View>

          {editing ? (
            <Animated.View
              entering={FadeInDown.duration(320)}
              style={[styles.editPanel, { backgroundColor: glassBg, borderColor: glassBorder }]}
            >
              <BlurView
                intensity={28}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
              <Field
                label="Nome"
                value={profile.firstName}
                onChangeText={(firstName) => patch({ firstName })}
                placeholder="Mario"
                autoCapitalize="words"
              />
              <Field
                label="Cognome"
                value={profile.lastName}
                onChangeText={(lastName) => patch({ lastName })}
                placeholder="Rossi"
                autoCapitalize="words"
              />
              <Field
                label="Email"
                value={profile.email}
                onChangeText={(email) => patch({ email })}
                placeholder="tu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(80).duration(420)} style={styles.pulse}>
            <Pulse
              value={favorites.length}
              label="Preferiti"
              color={colors.ink}
              muted={colors.muted}
              onPress={() => router.push('/(tabs)/favorites')}
            />
            <View style={[styles.pulseRule, { backgroundColor: colors.line }]} />
            <Pulse
              value={playlists.length}
              label="Playlist"
              color={colors.ink}
              muted={colors.muted}
              onPress={() => router.push('/(tabs)/library')}
            />
            <View style={[styles.pulseRule, { backgroundColor: colors.line }]} />
            <Pulse
              value={tastes.length}
              label="Gusti"
              color={colors.ink}
              muted={colors.muted}
              onPress={() => router.push('/tastes')}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(420)} style={styles.actions}>
            <ActionTile
              icon="color-palette-outline"
              title="I tuoi gusti"
              subtitle={
                tastes.length
                  ? `${tastes.length} artisti · personalizzano la Home`
                  : 'Scegli chi vuoi sentire di più'
              }
              onPress={() => router.push('/tastes')}
              accent={colors.green}
              glassBg={glassBg}
              glassBorder={glassBorder}
              ink={colors.ink}
              muted={colors.muted}
              isDark={isDark}
            />
            <ActionTile
              icon="cloud-download-outline"
              title="Importa da Spotify"
              subtitle="Incolla il link di una playlist"
              onPress={() => router.push('/import')}
              accent={colors.green}
              glassBg={glassBg}
              glassBorder={glassBorder}
              ink={colors.ink}
              muted={colors.muted}
              isDark={isDark}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(420)} style={styles.authBlock}>
            {!connected ? (
              <Pressable
                onPress={signInGoogle}
                style={({ pressed }) => [
                  styles.googleBtn,
                  {
                    backgroundColor: colors.green,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Ionicons name="logo-google" size={18} color="#FFFFFF" />
                <Text style={styles.googleText}>Continua con Google</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [
                  styles.signOutBtn,
                  {
                    borderColor: glassBorder,
                    backgroundColor: glassBg,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.signOutText, { color: colors.danger }]}>Disconnetti</Text>
              </Pressable>
            )}
            <Text style={[styles.version, { color: colors.muted }]}>
              Lyra · v{version} · tema {isDark ? 'scuro' : 'chiaro'}
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Pulse({
  value,
  label,
  color,
  muted,
  onPress,
}: {
  value: number;
  label: string;
  color: string;
  muted: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.pulseItem, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.pulseValue, { color }]}>{value}</Text>
      <Text style={[styles.pulseLabel, { color: muted }]}>{label}</Text>
    </Pressable>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  onPress,
  accent,
  glassBg,
  glassBorder,
  ink,
  muted,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent: string;
  glassBg: string;
  glassBorder: string;
  ink: string;
  muted: string;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: glassBg, borderColor: glassBorder, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <BlurView intensity={24} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[styles.tileIcon, { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.12)' }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <View style={styles.tileText}>
        <Text style={[styles.tileTitle, { color: ink }]}>{title}</Text>
        <Text style={[styles.tileSub, { color: muted }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={muted} />
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words';
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: colors.ink,
            backgroundColor: colors.elev2,
            borderColor: colors.line,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroGlow: {
    ...StyleSheet.absoluteFill,
  },
  orb: {
    position: 'absolute',
    top: -40,
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: 6,
  },
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    padding: 3,
    marginBottom: 14,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 51,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Type.display,
    fontSize: 34,
    letterSpacing: -1,
  },
  name: {
    fontFamily: Type.display,
    fontSize: 30,
    letterSpacing: -1.2,
    textAlign: 'center',
    maxWidth: '92%',
  },
  status: {
    fontFamily: Type.ui,
    fontSize: 14,
    textAlign: 'center',
  },
  editLink: {
    marginTop: 8,
    paddingVertical: 4,
  },
  editLinkText: {
    fontFamily: Type.uiSemi,
    fontSize: 14,
  },
  editPanel: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  pulse: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: Spacing.xl,
    paddingVertical: 8,
  },
  pulseItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  pulseRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 10,
  },
  pulseValue: {
    fontFamily: Type.display,
    fontSize: 28,
    letterSpacing: -1,
  },
  pulseLabel: {
    fontFamily: Type.uiMed,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  actions: {
    gap: 12,
    marginBottom: Spacing.xl,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { flex: 1, gap: 3 },
  tileTitle: {
    fontFamily: Type.uiSemi,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  tileSub: {
    fontFamily: Type.ui,
    fontSize: 13,
    lineHeight: 17,
  },
  authBlock: {
    gap: 16,
    alignItems: 'center',
  },
  googleBtn: {
    alignSelf: 'stretch',
    height: 54,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleText: {
    fontFamily: Type.uiSemi,
    fontSize: 16,
    color: '#FFFFFF',
  },
  signOutBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  signOutText: {
    fontFamily: Type.uiSemi,
    fontSize: 15,
  },
  version: {
    fontFamily: Type.ui,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  field: { gap: 6 },
  fieldLabel: {
    fontFamily: Type.uiMed,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: Type.uiMed,
    fontSize: 16,
  },
});
