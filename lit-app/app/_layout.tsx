import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthBootstrap } from '@/components/AuthBootstrap';
import { PwaUpdateBootstrap } from '@/components/PwaUpdateBootstrap';
import { StableViewportLock } from '@/components/StableViewportLock';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
    <StableViewportLock />
    <PwaUpdateBootstrap>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthBootstrap>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="auth-confirmed" />
          <Stack.Screen name="profile-setup" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
      </AuthBootstrap>
      <StatusBar style="auto" />
    </ThemeProvider>
    </PwaUpdateBootstrap>
    </SafeAreaProvider>
  );
}
