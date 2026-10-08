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

/** Planned notifications (see `src/notifications`) carry `data.source = 'pomi'`. */
function isPlanned(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'source' in data && data.source === 'pomi';
}

/**
 * Foreground behavior of every notification: Pomi's planned reminders are always shown; a timer
 * alarm is silent while the session screen rings by itself. Safe to call more than once.
 */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const show = isPlanned(notification.request.content.data) || !inAppFeedbackActive;
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}

/** A trigger closer than this to "now" is not scheduled: it would fire late or be rejected. */
export const MIN_LEAD_MS = 1000;

/** Whether an end timestamp is still far enough in the future to schedule a notification. */
export function isSchedulable(
  endsAt: number,
  now: number,
  marginMs: number = MIN_LEAD_MS,
): boolean {
  return endsAt > now + marginMs;
}

type PermissionApi = {
  /** Current state without prompting. */
  status(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  request(): Promise<{ granted: boolean }>;
};

/**
 * Asks for notification permission at most once per process and shares the IN-FLIGHT request:
 * concurrent callers wait for the same dialog instead of getting an early "no".
 */
export function createPermissionGate(api: PermissionApi): () => Promise<boolean> {
  let inFlight: Promise<boolean> | undefined;
  let asked = false;
  return () => {
    inFlight ??= (async () => {
      try {
        const current = await api.status();
        if (current.granted) return true;
        if (!current.canAskAgain || asked) return false;
        asked = true;
        return (await api.request()).granted;
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  };
}

/**
 * Requests notification permission the first time a timer starts (the full permission screen is
 * `src/notifications/permissions`). A denial just means no background alarm.
 */
export const ensureNotificationPermission = createPermissionGate({
  status: () => Notifications.getPermissionsAsync(),
  request: () => Notifications.requestPermissionsAsync(),
});

/** Real effects for the timer store. `channelName` is the translated channel title. */
export function createNotificationEffects(getChannelName: () => string): TimerEffects {
  installNotificationHandler();
  return {
    async schedule(endsAt: number, content: TimerNotification): Promise<string | null> {
      try {
        await ensureTimersChannel(getChannelName());
        if (!(await ensureNotificationPermission())) return null;
        // The channel and the permission dialog can take a while: the end may be here already.
        if (!isSchedulable(endsAt, Date.now())) return null;
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
