// Applies a diff against the OS scheduler. Expo-free (the API is injected) so it is unit tested.
import {
  diffSchedule,
  type ResolvedNotification,
  type ScheduledEntry,
} from '../domain/notifications/diff';

export type SchedulerApi<T extends ResolvedNotification> = {
  list(): Promise<ScheduledEntry[]>;
  schedule(notification: T, signature: string): Promise<void>;
  cancel(id: string): Promise<void>;
};

export type ReconcileResult = { scheduled: number; cancelled: number; failed: number };

export async function reconcile<T extends ResolvedNotification>(
  desired: readonly T[],
  api: SchedulerApi<T>,
  signatureOf: (notification: T) => string,
): Promise<ReconcileResult> {
  const { toSchedule, toCancel } = diffSchedule(desired, await api.list());
  const result: ReconcileResult = { scheduled: 0, cancelled: 0, failed: 0 };
  // Cancel first: the OS holds a limited number of alarms.
  for (const id of toCancel) {
    try {
      await api.cancel(id);
      result.cancelled += 1;
    } catch {
      result.failed += 1;
    }
  }
  const byId = new Map(desired.map((notification) => [notification.id, notification]));
  for (const id of toSchedule) {
    const notification = byId.get(id);
    if (!notification) continue;
    try {
      await api.schedule(notification, signatureOf(notification));
      result.scheduled += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
