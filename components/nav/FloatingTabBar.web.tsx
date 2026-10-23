import React, { type CSSProperties } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: { emit: Function; navigate: Function };
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

/** Web tab bar — position:fixed so it stays at the real viewport bottom. */
export function FloatingTabBar({ state, navigation }: TabBarProps): React.ReactElement {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const rawRoute = state.routes[state.index]?.name;
  const activeRoute = rawRoute === 'search' ? 'index' : rawRoute;

  return (
    <div style={wrap}>
      <div
        style={{
          ...pill,
          borderColor: colors.line,
          background: isDark ? 'rgba(22,22,22,0.88)' : 'rgba(255,255,255,0.9)',
        }}
      >
        {TABS.map((tab) => {
          const focused = activeRoute === tab.name;
          return (
            <button
              key={tab.name}
              type="button"
              aria-label={tab.name}
              aria-pressed={focused}
              onClick={() => {
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
              style={{
                ...item,
                background: focused ? colors.green : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Ionicons
                name={focused ? tab.iconActive : tab.icon}
                size={22}
                color={focused ? colors.onAccent : colors.muted}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  display: 'flex',
  justifyContent: 'center',
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
  pointerEvents: 'none',
};

const pill: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 5,
  gap: 2,
  pointerEvents: 'auto',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

const item: CSSProperties = {
  width: 50,
  height: 50,
  borderRadius: 25,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
