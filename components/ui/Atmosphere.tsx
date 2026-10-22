import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  variant?: 'home' | 'player' | 'search' | 'plain';
};

export function Atmosphere({ variant = 'home' }: Props) {
  const { colors, isDark } = useTheme();
  if (variant === 'plain') return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={
          isDark
            ? ['#0F1C33', colors.background, colors.background]
            : ['#DBEAFE', colors.background, colors.background]
        }
        locations={[0, 0.45, 1]}
        style={styles.wash}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
  },
});
