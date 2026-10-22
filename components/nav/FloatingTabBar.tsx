import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { Radius } from '@/constants/theme';

type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: any;
};

const TABS: {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}[] = [
  { name: 'index', icon: 'home-outline', iconActive: 'home' },
  { name: 'favorites', icon: 'heart-outline', iconActive: 'heart' },
  { name: 'library', icon: 'musical-notes-outline', iconActive: 'musical-notes' },
  { name: 'settings', icon: 'options-outline', iconActive: 'options' },
];

export function FloatingTabBar({ state, navigation }: TabBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const rawRoute = state.routes[state.index]?.name;
  const activeRoute = rawRoute === 'search' ? 'index' : rawRoute;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom - 2, 12) }]}
    >
      <View
        style={[
          styles.pill,
          {
            borderColor: colors.line,
            backgroundColor: isDark ? 'rgba(22,22,22,0.72)' : 'rgba(255,255,255,0.8)',
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 50 : 60}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        {TABS.map((tab) => {
          const focused = activeRoute === tab.name;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                void Haptics.selectionAsync();
                const route = state.routes.find((r) => r.name === tab.name);
                if (!route) {
                  if (tab.name === 'favorites') router.push('/(tabs)/favorites');
                  else if (tab.name === 'library') router.push('/(tabs)/library');
                  else if (tab.name === 'settings') router.push('/(tabs)/settings');
                  else router.push('/(tabs)');
                  return;
                }
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(tab.name);
                }
              }}
              style={[styles.item, focused && { backgroundColor: colors.green }]}
            >
              <Ionicons
                name={focused ? tab.iconActive : tab.icon}
                size={22}
                color={focused ? colors.onAccent : colors.muted}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 5,
    gap: 2,
    overflow: 'hidden',
  },
  item: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
