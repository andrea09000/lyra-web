import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { APP_NAME } from '@/constants/brand';
import { Radius } from '@/constants/theme';
import { useDesktop, DESKTOP_SIDEBAR_WIDTH } from '@/hooks/useDesktop';
import { useTheme } from '@/context/ThemeContext';

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
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'favorites', label: 'Preferiti', icon: 'heart-outline', iconActive: 'heart' },
  { name: 'library', label: 'Libreria', icon: 'musical-notes-outline', iconActive: 'musical-notes' },
  { name: 'settings', label: 'Profilo', icon: 'options-outline', iconActive: 'options' },
];

export function FloatingTabBar({ state, navigation }: TabBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const desktop = useDesktop();
  const { colors, isDark } = useTheme();

  const rawRoute = state.routes[state.index]?.name;
  const activeRoute = rawRoute === 'search' ? 'index' : rawRoute;

  const go = (tabName: string) => {
    void Haptics.selectionAsync();
    const route = state.routes.find((r) => r.name === tabName);
    if (!route) {
      if (tabName === 'favorites') router.push('/(tabs)/favorites');
      else if (tabName === 'library') router.push('/(tabs)/library');
      else if (tabName === 'settings') router.push('/(tabs)/settings');
      else router.push('/(tabs)');
      return;
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (activeRoute !== tabName && !event.defaultPrevented) {
      navigation.navigate(tabName);
    }
  };

  if (desktop) {
    return (
      <View
        style={[
          styles.side,
          {
            width: DESKTOP_SIDEBAR_WIDTH,
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 96,
            borderRightColor: colors.line,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable
          onPress={() => go('index')}
          style={styles.sideBrand}
          accessibilityLabel={APP_NAME}
        >
          <Image source={{ uri: '/logo.png' }} style={styles.sideLogo} />
          <Text style={[styles.sideBrandText, { color: colors.ink }]} numberOfLines={1}>
            {APP_NAME}
          </Text>
        </Pressable>

        <View style={styles.sideNav}>
          {TABS.map((tab) => {
            const focused = activeRoute === tab.name;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={tab.label}
                onPress={() => go(tab.name)}
                style={[
                  styles.sideItem,
                  focused && { backgroundColor: colors.greenPale },
                ]}
              >
                <Ionicons
                  name={focused ? tab.iconActive : tab.icon}
                  size={22}
                  color={focused ? colors.green : colors.muted}
                />
                <Text
                  style={[
                    styles.sideLabel,
                    { color: focused ? colors.green : colors.muted },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push('/(tabs)/search')}
          style={styles.sideItem}
          accessibilityLabel="Cerca"
        >
          <Ionicons name="search-outline" size={22} color={colors.muted} />
          <Text style={[styles.sideLabel, { color: colors.muted }]}>Cerca</Text>
        </Pressable>
      </View>
    );
  }

  // Low on screen, just clear of the home indicator
  const bottomGap = Math.min(Math.max(insets.bottom, 2), 10);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottomGap }]}>
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
              onPress={() => go(tab.name)}
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
    zIndex: 30,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    gap: 3,
    overflow: 'hidden',
  },
  item: {
    width: 52,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    zIndex: 30,
    gap: 8,
  },
  sideBrand: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  sideLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  sideBrandText: {
    fontFamily: 'Unbounded_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  sideNav: {
    flex: 1,
    width: '100%',
    gap: 4,
    paddingHorizontal: 8,
  },
  sideItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 14,
    width: '100%',
  },
  sideLabel: {
    fontFamily: 'Sora_500Medium',
    fontSize: 9,
    letterSpacing: 0.2,
  },
});
