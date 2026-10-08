// Background work, defined at module scope: the OS may start the JS bundle with no UI to run it.
// Imported FIRST by the custom entry (`index.ts`).
//
// 1. Notification ACTION buttons with the app closed (Android). expo-notifications docs
//    (registerTaskAsync): "Only on Android, the task also runs in response to a notification
//    action tap when the app is backgrounded or terminated." Pomi's actions use
//    `opensAppToForeground: false`, so the app does not open. On iOS this is not supported
//    (Pomi v1 is Android only).
//    https://docs.expo.dev/versions/latest/sdk/notifications/#run-javascript-in-response-to-incoming-notifications
// 2. A periodic WorkManager job (expo-background-task, >= 15 min, system decided) that refills the rolling 3-day window. The library hardcodes
//    `NetworkType.CONNECTED` in its WorkManager request (BackgroundTaskScheduler.kt); it is not
//    configurable, so the job never runs offline. The 72 h window is what covers that.
//    https://docs.expo.dev/versions/latest/sdk/background-task/
//    The same job also runs the sedentary nudge (PLAN §14b). expo-background-task docs: "all tasks run
//    through a single worker; the last registered task determines the minimum interval", so there is
//    ONE task and its interval is 15 minutes only while the nudge is on (otherwise 6 h).
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { getDatabase, getRepositories } from '../db';
import { bootstrapDatabase } from '../db/useDatabaseReady';
import { nudgeNeedsFrequentWorker } from '../sedentary/runNudge';
import { runSedentaryNudgeForReal } from '../sedentary/nudgeTask';
import { runDailySuggestions } from '../suggestions/run';

import { handleNotificationResponse } from './handleResponse';
import { runNotificationSync } from './sync';

export const NOTIFICATION_RESPONSE_TASK = 'pomi-notification-response';
export const NOTIFICATION_SYNC_TASK = 'pomi-notification-sync';
/** Minutes between background refills (the system treats it as a minimum). */
export const SYNC_INTERVAL_MIN = 6 * 60;
/** The minimum WorkManager allows; used while the sedentary nudge is on. */
export const FREQUENT_INTERVAL_MIN = 15;

/** Minutes between runs of the single background job. */
export function workerIntervalFor(frequent: boolean): number {
  return frequent ? FREQUENT_INTERVAL_MIN : SYNC_INTERVAL_MIN;
}

function isResponse(data: unknown): data is Notifications.NotificationResponse {
  return typeof data === 'object' && data !== null && 'actionIdentifier' in data;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  NOTIFICATION_RESPONSE_TASK,
  async ({ data, error }) => {
    if (error || !isResponse(data)) return;
    try {
      await handleNotificationResponse(data);
    } catch (failure) {
      if (__DEV__) console.warn('Could not apply the notification action', failure);
    }
  },
);

TaskManager.defineTask(NOTIFICATION_SYNC_TASK, async () => {
  try {
    await bootstrapDatabase();
    // Once per day: look for suggestions while the app is closed (the card waits on Hoy).
    await runDailySuggestions(getDatabase(), getRepositories()).catch(() => []);
    // Same mutex as the foreground triggers; a failure still answers Failed to WorkManager.
    await runNotificationSync();
    // The nudge never makes the job fail: a missed nudge is fine, it is approximate by nature.
    await runSedentaryNudgeForReal().catch((error: unknown) => {
      if (__DEV__) console.warn('Sedentary nudge failed', error);
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Registers both tasks (persisted by the OS; calling it again is harmless). */
export async function registerBackgroundTasks(): Promise<void> {
  await Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK);
  await refreshBackgroundSchedule();
}

/**
 * (Re)registers the periodic job with the interval the current settings need: every ~15 minutes
 * while the sedentary nudge is on, every 6 hours otherwise. Call it again after the nudge settings
 * change.
 */
export async function refreshBackgroundSchedule(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) {
    return;
  }
  const frequent = nudgeNeedsFrequentWorker(await getRepositories().settings.get('sedentaryNudge'));
  await BackgroundTask.registerTaskAsync(NOTIFICATION_SYNC_TASK, {
    minimumInterval: workerIntervalFor(frequent),
  });
}
