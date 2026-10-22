import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  size: number;
  progress: number; // 0..1
  stroke?: number;
  children?: ReactNode;
};

export function CircularSeek({ size, progress, stroke = 4, children }: Props) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  const dash = useMemo(() => `${c * p} ${c}`, [c, p]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="rgba(244,247,236,0.18)"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.green}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash}
            fill="none"
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}
