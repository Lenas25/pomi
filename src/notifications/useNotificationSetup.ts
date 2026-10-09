// Mounted once by the root layout after the database is ready and the onboarding is complete:
// installs the foreground handler, registers the background tasks, refills the notification window
// whenever the app opens, applies action taps received while the app is alive and routes plain taps.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { installNotificationHandler } from '../timers/notifications';

import { registerBackgroundTasks } from './backgroundTasks';
import { handleNotificationResponse } from './handleResponse';
import { routeForNotification } from './responses';
import { requestNotificationSync } from './sync';

export function useNotificationSetup(enabled: boolean): void {
  const router = useRouter();
  const routed = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!enabled) return;
    // Runs right after the onboarding flips the guard: a native failure here must never take the
    // JS runtime down (an uncaught error in an effect is fatal in a release build).
    try {
      installNotificationHandler();
    } catch (error) {
      if (__DEV__) console.warn('Could not install the notification handler', error);
    }
    try {
      registerBackgroundTasks().catch((error: unknown) => {
        if (__DEV__) console.warn('Could not register the background tasks', error);
      });
    } catch (error) {
      if (__DEV__) console.warn('Could not register the background tasks', error);
    }
    void requestNotificationSync('appOpen');

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void requestNotificationSync('appOpen');
    });
    // Action buttons while the JS runtime is alive (the dedupe in `handleNotificationResponse`
    // covers the background task firing for the same tap).
    let responses: { remove: () => void } | undefined;
    try {
      responses = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response).catch((error: unknown) => {
          if (__DEV__) console.warn('Could not apply the notification action', error);
        });
      });
    } catch (error) {
      if (__DEV__) console.warn('Could not listen to notification actions', error);
    }
    return () => {
      appState.remove();
      responses?.remove();
    };
  }, [enabled]);

  // A plain tap on the notification body (also the one that launched the app from a killed state).
  useEffect(() => {
    if (!enabled || !lastResponse) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = `${lastResponse.notification.request.identifier}|${lastResponse.notification.date}`;
    if (routed.current === key) return;
    routed.current = key;
    const route = routeForNotification(lastResponse.notification.request.content.data);
    if (route) router.push(route);
  }, [enabled, lastResponse, router]);
}
