import { Tabs } from "expo-router";

/**
 * MYLIT uses custom bottom nav on each screen — hide the Expo Router tab bar.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        tabBarButton: () => null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
