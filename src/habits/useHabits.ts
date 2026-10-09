// Glue between the Habits tab and the repositories / Health Connect. The testable parts live in
// `habitsView.ts`, `habitsData.ts` and `src/health/sync.ts`; this file only wires them to React.
import { useCallback, useRef, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';

import { requestNotificationSync } from '../notifications/sync';
import { getRepositories } from '../db';
import type { ActivityKind } from '../domain/habits/activity';
import {
  connectAndSync,
  getHealthAdapter,
  recordSteps,
  syncSteps,
  type SyncOutcome,
} from '../health';
import { dayKeyFor } from '../domain/time';
import { saveGoals as saveStoredGoals } from '../settings/schedule';
import { loadHabitsData } from './habitsData';
import { buildHabitsView, type HabitsView } from './habitsView';
import { loadSleepDetail, type SleepDetail } from './sleepStats';

/** How the step counter is being fed (drives the notice under the counter). */
export type StepsFeed =
  'unknown' | 'connected' | 'denied' | 'unavailable' | 'update_required' | 'error';

export type HabitsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; today: string; view: HabitsView; sleep: SleepDetail };

const SYNC_DAYS = 7;
/** Health Connect only returns data from 30 days before the first grant, so that is the backfill. */
const CONNECT_DAYS = 30;

function feedOf(outcome: SyncOutcome): StepsFeed {
  return outcome.status === 'synced' ? 'connected' : outcome.status;
}

export function useHabits() {
  const [state, setState] = useState<HabitsState>({ status: 'loading' });
  const [feed, setFeed] = useState<StepsFeed>('unknown');
  const [connecting, setConnecting] = useState(false);
  // Drops results of a load that finished after a newer one started.
  const generation = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const ticket = (generation.current += 1);
    try {
      const repos = getRepositories();
      const today = dayKeyFor(new Date());
      const [data, sleep] = await Promise.all([
        loadHabitsData(repos, today),
        loadSleepDetail(repos, today),
      ]);
      if (ticket !== generation.current) return;
      setState({ status: 'ready', today, view: buildHabitsView(data, today), sleep });
    } catch (error) {
      if (__DEV__) console.error('Could not load the habits', error);
      if (ticket === generation.current) setState({ status: 'error' });
    }
  }, []);

  /** Loads, then reads Health Connect in the background and reloads if it changed anything. */
  const refresh = useCallback(async (): Promise<void> => {
    await load();
    const today = dayKeyFor(new Date());
    const outcome = await syncSteps({
      adapter: getHealthAdapter(),
      store: getRepositories().steps,
      from: format(subDays(parseISO(today), SYNC_DAYS - 1), 'yyyy-MM-dd'),
      to: today,
    });
    setFeed(feedOf(outcome));
    if (outcome.status === 'synced' && outcome.updated > 0) await load();
  }, [load]);

  const connect = useCallback(async (): Promise<void> => {
    setConnecting(true);
    try {
      const today = dayKeyFor(new Date());
      const outcome = await connectAndSync({
        adapter: getHealthAdapter(),
        store: getRepositories().steps,
        from: format(subDays(parseISO(today), CONNECT_DAYS - 1), 'yyyy-MM-dd'),
        to: today,
      });
      setFeed(feedOf(outcome));
      await load();
    } finally {
      setConnecting(false);
    }
  }, [load]);

  /** Runs a write, then reloads (also after a failure, so the screen shows what is really stored). */
  const write = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      try {
        await action();
        // A changed habit can change what is left to remind about (e.g. the water goal).
        void requestNotificationSync('dataChanged');
      } catch (error) {
        if (__DEV__) console.error('Could not save', error);
      }
      await load();
    },
    [load],
  );

  const setWater = useCallback(
    async (habitId: string, next: number): Promise<void> => {
      // Optimistic: the drop animates right away; the write follows.
      setState((current) =>
        current.status === 'ready' && current.view.water
          ? {
              ...current,
              view: { ...current.view, water: { ...current.view.water, value: next } },
            }
          : current,
      );
      await write(() => getRepositories().habitLogs.set(habitId, dayKeyFor(new Date()), next));
    },
    [write],
  );

  const setCheck = useCallback(
    (habitId: string, done: boolean) =>
      write(() => getRepositories().habitLogs.set(habitId, dayKeyFor(new Date()), done ? 1 : 0)),
    [write],
  );

  const saveSteps = useCallback(
    (steps: number) =>
      write(async () => {
        await recordSteps(getRepositories().steps, dayKeyFor(new Date()), steps, 'manual');
      }),
    [write],
  );

  const saveFood = useCallback(
    (text: string) => write(() => getRepositories().foodNotes.save(dayKeyFor(new Date()), text)),
    [write],
  );

  const saveGoals = useCallback(
    (patch: { waterGlassesRest?: number; waterGlassesGym?: number; stepsGoal?: number }) =>
      write(() => saveStoredGoals(getRepositories(), patch)),
    [write],
  );

  const answerActivity = useCallback(
    (kind: ActivityKind) =>
      write(() => getRepositories().activity.upsert(dayKeyFor(new Date()), kind, 'manual')),
    [write],
  );

  return {
    state,
    feed,
    connecting,
    load,
    refresh,
    connect,
    setWater,
    setCheck,
    saveSteps,
    saveFood,
    saveGoals,
    answerActivity,
    openHealthSettings: () => getHealthAdapter().openSettings(),
  };
}
