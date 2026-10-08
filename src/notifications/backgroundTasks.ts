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
import { getHealthAdapter } from '../health';
import { nudgePermissionState } from '../sedentary/enable';
import { nudgeNeedsFrequentWorker } from '../sedentary/runNudge';
import { runSedentaryNudgeForReal } from '../sedentary/nudgeTask';
import { runDailySuggestions } from '../suggestions/run';

import { intervalFor, runBackgroundJob, shouldRegister } from './backgroundPolicy';
import { handleNotificationResponse } from './handleResponse';
import { runNotificationSync } from './sync';

export const NOTIFICATION_RESPONSE_TASK = 'pomi-notification-response';
export const NOTIFICATION_SYNC_TASK = 'pomi-notification-sync';

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
  const repos = () => getRepositories();
  const result = await runBackgroundJob({
    now: () => new Date(),
    bootstrap: bootstrapDatabase,
    lastHeavyRunAt: () => repos().settings.get('backgroundLastHeavyRunAt'),
    saveHeavyRunAt: (ms) => repos().settings.set('backgroundLastHeavyRunAt', ms),
    // Once per day: look for suggestions while the app is closed (the card waits on Hoy).
    suggestions: () => runDailySuggestions(getDatabase(), getRepositories()),
    sync: runNotificationSync,
    nudge: runSedentaryNudgeForReal,
    permissionCheck: checkNudgePermissionLoss,
    report: (what, error) => {
      if (__DEV__) console.warn(`Background job: ${what} failed`, error);
    },
  });
  return result === 'success'
    ? BackgroundTask.BackgroundTaskResult.Success
    : BackgroundTask.BackgroundTaskResult.Failed;
});

/**
 * The nudge is on but a Health Connect permission is gone: turn it off, leave a flag so the
 * settings screen explains it once, and drop the cadence back to 6 h. Errors keep the state.
 */
async function checkNudgePermissionLoss(): Promise<void> {
  const settings = getRepositories().settings;
  if (!nudgeNeedsFrequentWorker(await settings.get('sedentaryNudge'))) return;
  if ((await nudgePermissionState(getHealthAdapter())) !== 'missing') return;
  await settings.update('sedentaryNudge', (stored) => ({ ...(stored ?? {}), enabled: false }));
  await settings.set('sedentaryPermissionLost', true);
  await refreshBackgroundSchedule();
}

/** Registers both tasks (persisted by the OS; calling it again is harmless). */
export async function registerBackgroundTasks(): Promise<void> {
  await Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK);
  await refreshBackgroundSchedule();
}

/**
 * Registers the periodic job with the cadence the current settings need (15 minutes while the
 * nudge can run, 6 hours otherwise). The registration is remembered: registering again resets the
 * WorkManager period, so it only happens when the cadence flips or the job is not registered
 * (fresh install). `force` registers anyway (after a backup restore). Call it after the nudge
 * settings change.
 */
export async function refreshBackgroundSchedule(options: { force?: boolean } = {}): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) {
    return;
  }
  const settings = getRepositories().settings;
  const config = await settings.get('sedentaryNudge');
  const permitted = nudgeNeedsFrequentWorker(config)
    ? await getHealthAdapter()
        .hasBackgroundPermission()
        .catch(() => false)
    : false;
  const wanted = intervalFor(config, permitted);
  const registered = await TaskManager.isTaskRegisteredAsync(NOTIFICATION_SYNC_TASK);
  if (
    !options.force &&
    !shouldRegister(wanted, await settings.get('backgroundIntervalMin'), registered)
  ) {
    return;
  }
  await BackgroundTask.registerTaskAsync(NOTIFICATION_SYNC_TASK, { minimumInterval: wanted });
  await settings.set('backgroundIntervalMin', wanted);
}
