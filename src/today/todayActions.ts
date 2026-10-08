// What the person can do to a timeline row. Pure over injected dependencies (tested with fakes).
import type { EntryAction, TimelineEntry } from '../domain/today/timeline';
import { SNOOZE_MINUTES, doneActionFor } from '../domain/today/timeline';

import type { TodayState } from './todayView';

export type TodayActionDeps = {
  today: string;
  now: () => number;
  /** Persisted state of the day. */
  state: () => Promise<TodayState>;
  saveState: (state: TodayState) => Promise<void>;
  logCheck: (habitId: string, date: string) => Promise<void>;
  addWater: (habitId: string, date: string) => Promise<void>;
  /** A local notification at `at` that brings the item back (best effort). */
  scheduleSnooze: (entry: TimelineEntry, at: number) => Promise<void>;
};

export type ActionResult =
  | { type: 'changed' }
  | { type: 'navigate'; target: Extract<EntryAction, { type: 'open' }>['target'] };

function without(list: readonly string[], id: string): string[] {
  return list.filter((value) => value !== id);
}

/** Swipe right / the check button. */
export async function markDone(entry: TimelineEntry, deps: TodayActionDeps): Promise<ActionResult> {
  const action = doneActionFor(entry);
  switch (action.type) {
    case 'open':
      return { type: 'navigate', target: action.target };
    case 'logCheck':
      await deps.logCheck(action.habitId, deps.today);
      return { type: 'changed' };
    case 'addWater':
      await deps.addWater(action.habitId, deps.today);
      return { type: 'changed' };
    case 'acknowledge': {
      const state = await deps.state();
      await deps.saveState({
        ...state,
        acked: [...without(state.acked, entry.id), entry.id],
        skipped: without(state.skipped, entry.id),
      });
      return { type: 'changed' };
    }
  }
}

/** Long press > "Posponer 10 min": shows it 10 minutes later and schedules a reminder for then. */
export async function postpone(entry: TimelineEntry, deps: TodayActionDeps): Promise<ActionResult> {
  const at = deps.now() + SNOOZE_MINUTES * 60_000;
  const state = await deps.state();
  await deps.saveState({
    ...state,
    snoozed: { ...state.snoozed, [entry.id]: at },
    skipped: without(state.skipped, entry.id),
  });
  // A reminder that cannot be scheduled (no permission) must not undo the postponement.
  await deps.scheduleSnooze(entry, at).catch(() => undefined);
  return { type: 'changed' };
}

/** Long press > "Omitir hoy": a skipped item is neutral, never a miss. */
export async function skipToday(
  entry: TimelineEntry,
  deps: TodayActionDeps,
): Promise<ActionResult> {
  const state = await deps.state();
  const snoozed = Object.fromEntries(
    Object.entries(state.snoozed).filter(([id]) => id !== entry.id),
  );
  await deps.saveState({
    ...state,
    skipped: [...without(state.skipped, entry.id), entry.id],
    snoozed,
  });
  return { type: 'changed' };
}
