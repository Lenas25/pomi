// expo-notifications glue for timers (PLAN §7.2): ONE local notification at the end timestamp on
// the Android channel `timers`, so the alarm rings with the screen off.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { TimerEffects, TimerNotification } from './timerStore';

/**
 * Android channel for timer alarms. Android freezes a channel's importance/sound/vibration after
 * creation (only name/description can change), so changing them needs a NEW id (e.g. `timers-v2`).
 */
export const TIMERS_CHANNEL_ID = 'timers';

const VIBRATION_PATTERN = [0, 400, 200, 400, 200, 600];

let channelReady: Promise<void> | undefined;

export function ensureTimersChannel(channelName: string): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(TIMERS_CHANNEL_ID, {
    name: channelName,
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: VIBRATION_PATTERN,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      channelReady = undefined;
      throw error;
    });
  return channelReady;
}

// While the session screen is mounted the app beeps and rings by itself, so the system
// notification stays silent in the foreground; otherwise it is shown like any other alert.
let inAppFeedbackActive = false;

export function setInAppTimerFeedback(active: boolean): void {
  inAppFeedbackActive = active;
}

let handlerInstalled = false;

function installForegroundHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: !inAppFeedbackActive,
      shouldShowList: !inAppFeedbackActive,
      shouldPlaySound: !inAppFeedbackActive,
      shouldSetBadge: false,
    }),
  });
}

let permissionRequested = false;

/**
 * Requests notification permission the first time a timer starts (the full permission onboarding
 * comes in M6). Asks at most once per process; a denial just means no background alarm.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || permissionRequested) return false;
  permissionRequested = true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Real effects for the timer store. `channelName` is the translated channel title. */
export function createNotificationEffects(getChannelName: () => string): TimerEffects {
  installForegroundHandler();
  return {
    async schedule(endsAt: number, content: TimerNotification): Promise<string | null> {
      try {
        await ensureTimersChannel(getChannelName());
        if (!(await ensureNotificationPermission())) return null;
        return await Notifications.scheduleNotificationAsync({
          content: { title: content.title, body: content.body, sound: true },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: endsAt,
            channelId: TIMERS_CHANNEL_ID,
          },
        });
      } catch (error) {
        if (__DEV__) console.warn('Could not schedule the timer notification', error);
        return null;
      }
    },
    async cancel(notificationId: string): Promise<void> {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    },
  };
}
