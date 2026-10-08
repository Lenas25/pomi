import type { DailySteps, HealthAdapter, StepsSourceId } from './types';

/** The slice of the steps repository that sync needs. */
export type StepsStore = {
  get(date: string): Promise<{ steps: number; source: StepsSourceId } | undefined>;
  upsert(date: string, steps: number, source: StepsSourceId): Promise<void>;
};

export type SyncOutcome =
  | { status: 'synced'; updated: number }
  /** Permission missing: the counter stays manual. */
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'update_required' }
  | { status: 'error'; error: unknown };

/**
 * Whether a Health Connect reading replaces what is stored. An automatic count wins over a manual
 * one, but a zero never wipes a number the person typed (Health Connect can report 0 when no app
 * has written steps yet).
 */
export function shouldReplace(
  existing: { steps: number; source: StepsSourceId } | undefined,
  incoming: DailySteps,
): boolean {
  if (!existing) return true;
  if (existing.source === 'health_connect') return existing.steps !== incoming.steps;
  return incoming.steps > 0;
}

/**
 * Reads `from..to` from the adapter and upserts `steps_daily` with source `health_connect`.
 * Never prompts: call `connect` for that. When the permission is missing or Health Connect is not
 * there, nothing is written and the outcome tells the UI to keep the manual input.
 */
export async function syncSteps(options: {
  adapter: HealthAdapter;
  store: StepsStore;
  from: string;
  to: string;
}): Promise<SyncOutcome> {
  const { adapter, store, from, to } = options;
  try {
    const availability = await adapter.getAvailability();
    if (availability === 'unavailable') return { status: 'unavailable' };
    if (availability === 'update_required') return { status: 'update_required' };
    if (!(await adapter.hasPermission())) return { status: 'denied' };

    let updated = 0;
    for (const day of await adapter.readDailySteps(from, to)) {
      const steps = Math.max(0, Math.round(day.steps));
      const incoming = { date: day.date, steps };
      if (shouldReplace(await store.get(day.date), incoming)) {
        await store.upsert(day.date, steps, 'health_connect');
        updated += 1;
      }
    }
    return { status: 'synced', updated };
  } catch (error) {
    return { status: 'error', error };
  }
}

/** Asks for the permission and, if it was granted, syncs right away. */
export async function connectAndSync(options: {
  adapter: HealthAdapter;
  store: StepsStore;
  from: string;
  to: string;
}): Promise<SyncOutcome> {
  try {
    const availability = await options.adapter.getAvailability();
    if (availability === 'unavailable') return { status: 'unavailable' };
    if (availability === 'update_required') return { status: 'update_required' };
    if (!(await options.adapter.requestPermission())) return { status: 'denied' };
  } catch (error) {
    return { status: 'error', error };
  }
  return syncSteps(options);
}
