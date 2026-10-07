import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_900Black } from '@expo-google-fonts/nunito';
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../src/i18n';
import { IconProvider } from '../src/ui/icons';
import { ThemeProvider, useTheme } from '../src/ui/theme';
import { useThemeModeStore } from '../src/ui/themeModeStore';

// Keep the native splash visible until fonts are ready. Must run at module scope.
void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }}
      />
    </>
  );
}

export default function RootLayout() {
  const mode = useThemeModeStore((state) => state.mode);
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    Nunito_900Black,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider mode={mode}>
        <IconProvider>
          <RootStack />
        </IconProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
