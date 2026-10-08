// From the loaded data to what the Hoy screen shows. Pure (the clock comes in as an argument).
import type { AgendaItem } from '../domain/agenda/buildAgenda';
import type { DayProgress } from '../domain/today/timeline';
import type { HabitsView } from '../habits/habitsView';

export type TodayState = {
  date: string;
  skipped: string[];
  acked: string[];
  snoozed: Record<string, number>;
};

export function emptyTodayState(date: string): TodayState {
  return { date, skipped: [], acked: [], snoozed: {} };
}

/** A stored state of another day is ignored. */
export function todayStateFor(stored: TodayState | undefined, date: string): TodayState {
  return stored && stored.date === date ? stored : emptyTodayState(date);
}

export type LiveFacts = {
  /** A finished gym session with sets exists today. */
  gymDone: boolean;
  view: HabitsView;
};

/** Which agenda items are complete according to the real data of today. */
export function doneIdsFrom(agenda: readonly AgendaItem[], facts: LiveFacts): Set<string> {
  const done = new Set<string>();
  const { view } = facts;
  for (const item of agenda) {
    switch (item.kind) {
      case 'gym':
        if (facts.gymDone) done.add(item.id);
        break;
      case 'checkin':
        if (item.id === 'checkin:morning' && view.checkins.morning.done) done.add(item.id);
        if (item.id === 'checkin:night' && view.checkins.night.done) done.add(item.id);
        break;
      case 'water': {
        const water = view.water;
        if (
          water !== null &&
          water.habitId === item.habitId &&
          water.target &&
          water.value >= water.target.glasses
        ) {
          done.add(item.id);
        }
        break;
      }
      case 'steps': {
        const steps = view.steps;
        const goal = steps?.plan.goal ?? null;
        if (
          steps !== null &&
          steps.habitId === item.habitId &&
          goal !== null &&
          steps.steps >= goal
        ) {
          done.add(item.id);
        }
        break;
      }
      case 'habit':
        if (view.checks.some((check) => check.habitId === item.habitId && check.done)) {
          done.add(item.id);
        }
        break;
      case 'reminder':
        break;
    }
  }
  return done;
}

/** `snoozed` holds epoch ms; the timeline wants the minute of TODAY it points at. */
export function progressFrom(
  agenda: readonly AgendaItem[],
  facts: LiveFacts,
  state: TodayState,
  midnight: Date,
): DayProgress {
  const snoozedTo = new Map<string, number>();
  for (const [id, at] of Object.entries(state.snoozed)) {
    snoozedTo.set(id, Math.round((at - midnight.getTime()) / 60_000));
  }
  return {
    doneIds: doneIdsFrom(agenda, facts),
    ackedIds: new Set(state.acked),
    skippedIds: new Set(state.skipped),
    snoozedTo,
  };
}

/** The "x de y vasos" line of the water row (other rows have no subtitle). */
export function waterProgress(view: HabitsView): { done: number; total: number } | null {
  const water = view.water;
  return water?.target ? { done: water.value, total: water.target.glasses } : null;
}
