import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useDesktop, DESKTOP_CONTENT_MAX } from '@/hooks/useDesktop';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/** Centers page content on wide screens; full-bleed on phone. */
export function ContentWidth({ children, style }: Props) {
  const desktop = useDesktop();
  if (!desktop) {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }
  return (
    <View style={[styles.outer, style]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: DESKTOP_CONTENT_MAX,
  },
});
