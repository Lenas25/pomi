import type { HealthAdapter, StepsSourceId } from './types';

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

type StoredSteps = { steps: number; source: StepsSourceId };

/**
 * What `steps_daily` should hold after `incoming` arrives, or `null` when nothing changes. The
 * stored value is the MAX of what the person typed and what Health Connect counted, and it records
 * the source of the winner, so a typed number is never lost to a lower automatic reading:
 *  - nothing stored: write it (a Health Connect zero is "no data", it is not written);
 *  - same source: the new value replaces the old one (a typo can be corrected, and Health Connect
 *    may revise its own count downward);
 *  - different sources: the larger wins, ties keep what is there.
 */
export function mergeSteps(
  existing: StoredSteps | undefined,
  incoming: StoredSteps,
): StoredSteps | null {
  if (!existing)
    return incoming.source === 'health_connect' && incoming.steps === 0 ? null : incoming;
  if (existing.source === incoming.source) {
    return existing.steps === incoming.steps ? null : incoming;
  }
  return incoming.steps > existing.steps ? incoming : null;
}

/** Applies `mergeSteps` to one day of the store. Returns whether a row was written. */
export async function recordSteps(
  store: StepsStore,
  date: string,
  steps: number,
  source: StepsSourceId,
): Promise<boolean> {
  const next = mergeSteps(await store.get(date), { steps, source });
  if (!next) return false;
  await store.upsert(date, next.steps, next.source);
  return true;
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
      if (await recordSteps(store, day.date, steps, 'health_connect')) updated += 1;
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
