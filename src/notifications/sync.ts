// The notification scheduler (PLAN §7.1): computes the rolling window, diffs it against what the
// OS holds and applies the difference. `runSync` is pure over injected dependencies (tested with
// fakes); `syncNotifications` wires the real ones.
import * as Notifications from 'expo-notifications';

import { getRepositories } from '../db';
import type { ScheduledEntry } from '../domain/notifications/diff';
import { t } from '../i18n';

import { registerCategories } from './categories';
import { ensureChannels } from './channels';
import { SOURCE, type PlannedPayload } from './constants';
import { loadNotificationPlan } from './loadState';
import type { SchedulerApi } from './reconcile';
import type { ResolvedPlanned } from './resolve';
import { runSync, type SyncResult } from './runSync';

// --- Real dependencies -----------------------------------------------------------------------

function toPayload(notification: ResolvedPlanned, signature: string): PlannedPayload {
  const { data, channel } = notification.planned;
  return { ...data, source: SOURCE, channel, sig: signature };
}

const expoApi: SchedulerApi<ResolvedPlanned> = {
  async list(): Promise<ScheduledEntry[]> {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    return requests.map((request) => {
      const data: unknown = request.content.data;
      const sig =
        typeof data === 'object' && data !== null && 'sig' in data && typeof data.sig === 'string'
          ? data.sig
          : undefined;
      return { id: request.identifier, signature: sig };
    });
  },
  async schedule(notification, signature) {
    await Notifications.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: notification.title,
        body: notification.body,
        sound: true,
        data: toPayload(notification, signature),
        ...(notification.category ? { categoryIdentifier: notification.category } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notification.at,
        channelId: notification.channel,
      },
    });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};

export function syncNotifications(): Promise<SyncResult> {
  return runSync({
    now: () => new Date(),
    loadPlan: (today) => loadNotificationPlan(getRepositories(), today),
    canNotify: async () => (await Notifications.getPermissionsAsync()).granted,
    prepare: async (translate) => {
      await Promise.all([ensureChannels(translate), registerCategories(translate)]);
    },
    api: expoApi,
    t,
  });
}

// --- Triggers --------------------------------------------------------------------------------

export type SyncReason =
  | 'appOpen'
  | 'settingsChanged'
  | 'onboardingComplete'
  | 'suggestionAccepted'
  | 'dataChanged'
  | 'background';

let running: Promise<unknown> | undefined;
let again = false;

/**
 * Asks for a sync from anywhere. Runs are serialized and coalesced: requests that arrive while one
 * runs trigger exactly one more run afterwards, so the last state always wins.
 */
export function requestNotificationSync(_reason: SyncReason): Promise<unknown> {
  if (running) {
    again = true;
    return running;
  }
  const run = (async () => {
    try {
      do {
        again = false;
        await syncNotifications();
      } while (again);
    } catch (error) {
      if (__DEV__) console.warn('Notification sync failed', error);
    } finally {
      running = undefined;
    }
  })();
  running = run;
  return run;
}
