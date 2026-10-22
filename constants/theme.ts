export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  mist: string;
  fog: string;
  /** Primary accent — blue (legacy key `green`) */
  green: string;
  greenDeep: string;
  greenSoft: string;
  greenPale: string;
  greenGlow: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  danger: string;
  overlay: string;
  white: string;
  glassTint: string;
  glassSoft: string;
  glassDeep: string;
  playBtn: string;
  chipBg: string;
  elev1: string;
  elev2: string;
  signal: string;
  onAccent: string;
  rose: string;
  statusBar: 'light' | 'dark';
  blurTint: 'systemChromeMaterialLight' | 'systemChromeMaterialDark';
  glassScheme: 'light' | 'dark';
};

/** Charcoal + electric blue */
export const DarkColors: ThemeColors = {
  background: '#0A0A0A',
  surface: '#161616',
  mist: '#1C1C1C',
  fog: '#242424',
  green: '#3B82F6',
  greenDeep: '#2563EB',
  greenSoft: '#60A5FA',
  greenPale: '#0F1C33',
  greenGlow: '#0A1424',
  ink: '#FFFFFF',
  inkSoft: '#E8E8E8',
  muted: '#9A9A9A',
  line: '#2E2E2E',
  danger: '#F87171',
  overlay: 'rgba(0, 0, 0, 0.55)',
  white: '#FFFFFF',
  glassTint: 'rgba(59, 130, 246, 0.14)',
  glassSoft: 'rgba(22, 22, 22, 0.72)',
  glassDeep: 'rgba(59, 130, 246, 0.28)',
  playBtn: '#3B82F6',
  chipBg: '#242424',
  elev1: '#161616',
  elev2: '#242424',
  signal: '#3B82F6',
  onAccent: '#FFFFFF',
  rose: '#3B82F6',
  statusBar: 'light',
  blurTint: 'systemChromeMaterialDark',
  glassScheme: 'dark',
};

export const LightColors: ThemeColors = {
  background: '#F5F5F7',
  surface: '#FFFFFF',
  mist: '#EFEFF2',
  fog: '#E5E5EA',
  green: '#2563EB',
  greenDeep: '#1D4ED8',
  greenSoft: '#3B82F6',
  greenPale: '#DBEAFE',
  greenGlow: '#BFDBFE',
  ink: '#0A0A0A',
  inkSoft: '#3A3A3C',
  muted: '#8E8E93',
  line: '#D1D1D6',
  danger: '#DC2626',
  overlay: 'rgba(0, 0, 0, 0.35)',
  white: '#FFFFFF',
  glassTint: 'rgba(37, 99, 235, 0.1)',
  glassSoft: 'rgba(255, 255, 255, 0.75)',
  glassDeep: 'rgba(37, 99, 235, 0.16)',
  playBtn: '#2563EB',
  chipBg: '#DBEAFE',
  elev1: '#FFFFFF',
  elev2: '#F5F5F7',
  signal: '#2563EB',
  onAccent: '#FFFFFF',
  rose: '#2563EB',
  statusBar: 'dark',
  blurTint: 'systemChromeMaterialLight',
  glassScheme: 'light',
};

export const Colors = DarkColors;

export const Filament = {
  copper: '#3B82F6',
  copperDeep: '#2563EB',
  lightGlow: ['#DBEAFE', '#F5F5F7'] as [string, string],
  darkGlow: ['#0F1C33', '#0A0A0A'] as [string, string],
  signal: ['#60A5FA', '#3B82F6', '#2563EB'] as [string, string, string],
  avatar: ['#3B82F6', '#2563EB'] as [string, string],
  avatarLight: ['#60A5FA', '#2563EB'] as [string, string],
};

export const MetalViolet = Filament;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 44,
};

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  full: 999,
};

export const Shadows = {
  soft: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const Type = {
  // Prefer Sora for display too — Unbounded delayed boot / black screen when fonts blocked.
  // Unbounded still loaded for BrandMark when available.
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  displayMed: 'Sora_500Medium',
  displayItalic: 'Sora_600SemiBold',
  ui: 'Sora_400Regular',
  uiMed: 'Sora_500Medium',
  uiSemi: 'Sora_600SemiBold',
  uiBold: 'Sora_700Bold',
  brand: 'Unbounded_700Bold',
};
