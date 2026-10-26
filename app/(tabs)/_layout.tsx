import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FloatingTabBar } from '@/components/nav/FloatingTabBar';
import { MiniPlayer } from '@/components/music/MiniPlayer';
import { useTheme } from '@/context/ThemeContext';
import {
  useDesktop,
  DESKTOP_SIDEBAR_WIDTH,
  DESKTOP_PLAYER_HEIGHT,
} from '@/hooks/useDesktop';

export default function TabLayout() {
  const { colors } = useTheme();
  const desktop = useDesktop();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, flex: 1 }]}>
      <View
        style={[
          styles.scenes,
          desktop && {
            marginLeft: DESKTOP_SIDEBAR_WIDTH,
            marginBottom: DESKTOP_PLAYER_HEIGHT,
          },
        ]}
      >
        <Tabs
          // FloatingTabBar pads the home indicator itself — navigator insets
          // were stacking and floating the pill too high on iPhone.
          safeAreaInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
          tabBar={(props) => <FloatingTabBar state={props.state} navigation={props.navigation} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
            tabBarStyle: {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
              height: desktop ? 0 : undefined,
            },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="favorites" options={{ title: 'Preferiti' }} />
          <Tabs.Screen name="library" options={{ title: 'Libreria' }} />
          <Tabs.Screen name="settings" options={{ title: 'Profilo' }} />
          <Tabs.Screen name="search" options={{ href: null, title: 'Cerca' }} />
        </Tabs>
      </View>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scenes: {
    flex: 1,
  },
});
