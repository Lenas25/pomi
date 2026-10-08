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

import { useDatabaseReady } from '../src/db/useDatabaseReady';
import { routeGuards } from '../src/domain/onboarding/redirect';
import { useT } from '../src/i18n';
import { sweepOrphanPhotosAtStart } from '../src/photos/startupSweep';
import { useNotificationSetup } from '../src/notifications/useNotificationSetup';
import { useOnboardingStatusStore } from '../src/onboarding/statusStore';
import { EmptyState } from '../src/ui/EmptyState';
import { MaintenanceOverlay } from '../src/ui/MaintenanceOverlay';
import { Screen } from '../src/ui/Screen';
import { IconProvider } from '../src/ui/icons';
import { ThemeProvider, useTheme } from '../src/ui/theme';
import { useThemeModeStore } from '../src/ui/themeModeStore';

// Keep the native splash visible until fonts are ready. Must run at module scope.
void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const theme = useTheme();
  const status = useOnboardingStatusStore((state) => state.status);
  const guards = routeGuards(status);
  // Planned reminders, background tasks and action taps exist only once the person is onboarded.
  useNotificationSetup(guards.app);
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }}
      >
        {/* Until the onboarding is complete only its routes exist; afterwards only the app's. */}
        <Stack.Protected guard={guards.onboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={guards.app}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="gym/session" />
          {/* HANDOFF §5: the check-in is a bottom sheet over the app. */}
          <Stack.Screen name="checkin/[tipo]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="revision" />
          <Stack.Screen name="revision-mensual" />
          <Stack.Screen name="comparacion" />
          <Stack.Screen name="compartir" />
          <Stack.Screen name="permisos" />
          <Stack.Screen name="bateria" />
          <Stack.Screen name="respaldo" />
          <Stack.Screen name="fotos" />
          <Stack.Screen name="ciclos-sueno" />
          <Stack.Screen name="acerca" />
          <Stack.Screen name="importar-programa" />
          <Stack.Screen name="crear-rutina" />
        </Stack.Protected>
      </Stack>
      <MaintenanceOverlay />
    </>
  );
}

function DatabaseError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <Screen>
      <EmptyState
        title={t('database.errorTitle')}
        body={t('database.errorBody')}
        action={{ label: t('database.retry'), onPress: onRetry }}
      />
    </Screen>
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
  const { status: dbStatus, retry } = useDatabaseReady();
  useEffect(() => {
    if (__DEV__ && fontError)
      console.warn('Failed to load fonts; falling back to system fonts.', fontError);
  }, [fontError]);

  const ready = (fontsLoaded || fontError !== null) && dbStatus !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  useEffect(() => {
    if (dbStatus === 'ready') sweepOrphanPhotosAtStart();
  }, [dbStatus]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider mode={mode}>
        <IconProvider>
          {dbStatus === 'error' ? <DatabaseError onRetry={retry} /> : <RootStack />}
        </IconProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
