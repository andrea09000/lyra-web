import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FloatingTabBar } from '@/components/nav/FloatingTabBar';
import { MiniPlayer } from '@/components/music/MiniPlayer';
import { useTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, flex: 1 }]}>
      <Tabs
        tabBar={(props) => <FloatingTabBar state={props.state} navigation={props.navigation} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="favorites" options={{ title: 'Preferiti' }} />
        <Tabs.Screen name="library" options={{ title: 'Libreria' }} />
        <Tabs.Screen name="settings" options={{ title: 'Profilo' }} />
        <Tabs.Screen name="search" options={{ href: null, title: 'Cerca' }} />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
