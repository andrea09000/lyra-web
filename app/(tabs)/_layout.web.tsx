import type { CSSProperties } from 'react';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/nav/FloatingTabBar';
import { MiniPlayer } from '@/components/music/MiniPlayer';
import { useTheme } from '@/context/ThemeContext';

/**
 * Web tabs shell — escape RN Stack height:0 collapse with a fixed viewport shell.
 */
export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <div style={{ ...shell, background: colors.background }}>
      <div style={scene}>
        <Tabs
          tabBar={(props) => (
            <FloatingTabBar state={props.state} navigation={props.navigation} />
          )}
          screenOptions={{
            headerShown: false,
            sceneStyle: {
              backgroundColor: colors.background,
              flex: 1,
              height: '100%',
            },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="favorites" options={{ title: 'Preferiti' }} />
          <Tabs.Screen name="library" options={{ title: 'Libreria' }} />
          <Tabs.Screen name="settings" options={{ title: 'Profilo' }} />
          <Tabs.Screen name="search" options={{ href: null, title: 'Cerca' }} />
        </Tabs>
      </div>
      <MiniPlayer />
    </div>
  );
}

const shell: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const scene: CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  height: '100%',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
};
