// Real dependencies of `applyResponse` (database, expo-notifications). Used by the background task
// (app closed) and by the foreground listener.
import * as Notifications from 'expo-notifications';

import { bootstrapDatabase } from '../db/useDatabaseReady';
import { getRepositories } from '../db';
import { dayKeyFor } from '../domain/time';

import { processNotificationResponse } from './responsePayload';
import type { ResponseDeps, ResponseOutcome } from './responses';
import { requestNotificationSync } from './sync';

function realDeps(): ResponseDeps {
  const repos = getRepositories();
  return {
    today: () => dayKeyFor(new Date()),
    now: Date.now,
    claim: (key) => repos.settings.claimNotificationResponse(key),
    release: (key) => repos.settings.releaseNotificationResponse(key),
    logActivity: (date, kind) => repos.activity.upsert(date, kind, 'notification'),
    incrementHabit: (habitId, date) => repos.habitLogs.increment(habitId, date),
    setHabitDone: (habitId, date) => repos.habitLogs.set(habitId, date, 1),
    scheduleSnooze: async (request) => {
      await Notifications.scheduleNotificationAsync({
        identifier: request.id,
        content: {
          title: request.title,
          body: request.body,
          sound: true,
          data: request.data,
          ...(request.category ? { categoryIdentifier: request.category } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: request.at,
          channelId: request.channel,
        },
      });
    },
  };
}

/** `__DEV__` only: filter with `adb logcat -s ReactNativeJS:V ReactNative:V | grep PomiNotif`. */
function log(message: string, extra?: unknown): void {
  if (__DEV__) console.log(`[PomiNotif] ${message}`, extra ?? '');
}

/**
 * Applies a notification response from the listener (mapped) or the background task (raw native
 * bundle). Safe to call twice for the same response (deduped); dismisses the notification after.
 */
export function handleNotificationResponse(raw: unknown): Promise<ResponseOutcome> {
  return processNotificationResponse(raw, {
    bootstrap: bootstrapDatabase,
    deps: realDeps,
    dismiss: (id) => Notifications.dismissNotificationAsync(id),
    sync: () => requestNotificationSync('dataChanged'),
    log,
  });
}
