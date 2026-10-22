import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Mood } from '@/types/music';
import { Radius, Spacing } from '@/constants/theme';

type Props = {
  mood: Mood;
  onPress: (mood: Mood) => void;
};

export function MoodCard({ mood, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress(mood);
      }}
    >
      <LinearGradient colors={mood.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.orb} />
        <Text style={styles.title}>{mood.title}</Text>
        <Text style={styles.subtitle}>{mood.subtitle}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '48%',
    marginBottom: Spacing.md,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  card: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 108,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  orb: {
    position: 'absolute',
    top: -20,
    right: -16,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  title: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
  },
});
