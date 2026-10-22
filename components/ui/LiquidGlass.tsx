import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useTheme } from '@/context/ThemeContext';

export function canUseNativeLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

type Props = ViewProps & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  glassStyle?: 'clear' | 'regular';
  tintColor?: string;
  interactive?: boolean;
  intensity?: number;
};

export function LiquidGlass({
  children,
  style,
  glassStyle = 'regular',
  tintColor,
  interactive = true,
  intensity = 70,
  ...rest
}: Props) {
  const { colors, isDark } = useTheme();
  const tint = tintColor ?? colors.glassTint;

  if (canUseNativeLiquidGlass()) {
    return (
      <GlassView
        style={[styles.clip, style]}
        glassEffectStyle={glassStyle}
        tintColor={tint}
        isInteractive={interactive}
        colorScheme={colors.glassScheme}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.clip,
        isDark ? styles.fallbackDark : styles.fallbackLight,
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={intensity}
        tint={
          Platform.OS === 'ios'
            ? colors.blurTint
            : isDark
              ? 'dark'
              : 'light'
        }
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.fallbackWash, { backgroundColor: isDark ? 'rgba(63,164,106,0.12)' : 'rgba(216,239,226,0.18)' }]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.fallbackHighlight,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)' },
        ]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fallbackLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  fallbackDark: {
    backgroundColor: 'rgba(14, 26, 20, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  fallbackWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fallbackHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
});
