// Real dependencies of `applyResponse` (database, expo-notifications). Used by the background task
// (app closed) and by the foreground listener.
import { format } from 'date-fns';
import * as Notifications from 'expo-notifications';

import { bootstrapDatabase } from '../db/useDatabaseReady';
import { getRepositories } from '../db';

import { ACTIONS } from './constants';
import {
  applyResponse,
  claimKey,
  type ResponseDeps,
  type ResponseInput,
  type ResponseOutcome,
} from './responses';
import { requestNotificationSync } from './sync';

const handledInMemory = new Set<string>();

export function toResponseInput(response: Notifications.NotificationResponse): ResponseInput {
  const { request, date } = response.notification;
  return {
    actionIdentifier: response.actionIdentifier,
    notificationId: request.identifier,
    deliveredAt: date,
    title: request.content.title ?? '',
    body: request.content.body ?? '',
    categoryIdentifier: request.content.categoryIdentifier ?? null,
    data: request.content.data,
  };
}

function realDeps(): ResponseDeps {
  const repos = getRepositories();
  return {
    today: () => format(new Date(), 'yyyy-MM-dd'),
    now: Date.now,
    claim: async (key) => {
      if (handledInMemory.has(key)) return false;
      handledInMemory.add(key);
      const stored = (await repos.settings.get('handledNotificationResponses')) ?? [];
      const { handled, isNew } = claimKey(stored, key);
      if (isNew) await repos.settings.set('handledNotificationResponses', handled);
      return isNew;
    },
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

/** Applies a notification response. Safe to call twice for the same response (deduped). */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<ResponseOutcome> {
  const input = toResponseInput(response);
  if (input.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return 'ignored';
  // The headless run starts without the app's bootstrap: open + migrate the database first.
  await bootstrapDatabase();
  const outcome = await applyResponse(input, realDeps());
  if (outcome === 'handled' && input.actionIdentifier !== ACTIONS.snooze) {
    // A new answer can change what is left to remind about (water goal, today's survey).
    void requestNotificationSync('dataChanged');
  }
  return outcome;
}
