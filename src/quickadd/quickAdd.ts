// Quick add ("Registrar"): the actions of the center tab bar button that write data directly.
// Pure over the repositories, so it is testable with the in-memory database.
import type { Repositories } from '../db/repositories';
import type { CheckinKind } from '../domain/habits/checkins';
import { loadHabitsData } from '../habits/habitsData';
import { buildHabitsView } from '../habits/habitsView';
import { todaysRoutineId } from '../domain/gym/rotation';
import { pickProgram, ROTATION_LOOKBACK, toRotationSessions } from '../gym/program';

export type AddGlassResult =
  { status: 'added'; value: number; target: number | null } | { status: 'noWater' };

/** +1 glass on today's water habit (the same row the Habits tab writes). */
export async function addGlassOfWater(repos: Repositories, today: string): Promise<AddGlassResult> {
  const view = buildHabitsView(await loadHabitsData(repos, today), today);
  if (!view.water) return { status: 'noWater' };
  const value = view.water.value + 1;
  await repos.habitLogs.set(view.water.habitId, today, value);
  return { status: 'added', value, target: view.water.target?.glasses ?? null };
}

/** Hour (local) from which the quick check-in opens the night one instead of the morning one. */
export const NIGHT_CHECKIN_FROM_HOUR = 15;

/** The check-in of the time of day (morning before 15:00, night after). */
export function checkinKindForHour(hour: number): CheckinKind {
  return hour >= NIGHT_CHECKIN_FROM_HOUR ? 'night' : 'morning';
}

/** Per kind: answered today, or turned off in Ajustes (nothing to offer either way). */
export type CheckinsDone = Readonly<Record<CheckinKind, boolean>>;

/**
 * The check-in the quick add offers: the one of the time of day while it is pending, else the
 * other one if that is still pending, else `'done'` (both answered today).
 */
export function checkinKindAt(hour: number, done: CheckinsDone): CheckinKind | 'done' {
  const preferred = checkinKindForHour(hour);
  if (!done[preferred]) return preferred;
  const other: CheckinKind = preferred === 'night' ? 'morning' : 'night';
  return done[other] ? 'done' : other;
}

export type QuickMenu = {
  checkins: CheckinsDone;
  /** The routine the gym row starts: today's resumable session, else today's routine. */
  gymRoutineId: string | null;
};

/** What the quick-add menu needs (independent reads in parallel; no gym tab payload). */
export async function loadQuickMenu(repos: Repositories, today: string): Promise<QuickMenu> {
  const [prefs, morning, night, modules, recent, open] = await Promise.all([
    repos.settings.get('checkinPrefs'),
    repos.checkins.get(today, 'morning'),
    repos.checkins.get(today, 'night'),
    repos.templates.listModules(),
    repos.workouts.recentSessions(ROTATION_LOOKBACK),
    repos.workouts.unfinishedSessionOn(today),
  ]);
  const checkins = {
    morning: morning !== undefined || prefs?.morning === false,
    night: night !== undefined || prefs?.night === false,
  };
  const program = pickProgram(modules);
  if (!program) return { checkins, gymRoutineId: null };
  const routineIds = program.routines.map((routine) => routine.id);
  const resumable = open
    ? recent.find(
        (entry) =>
          entry.session.id === open.id &&
          entry.sets.length > 0 &&
          routineIds.includes(entry.session.routineId),
      )
    : undefined;
  return {
    checkins,
    gymRoutineId:
      resumable?.session.routineId ??
      todaysRoutineId(routineIds, toRotationSessions(recent), today),
  };
}

export type QuickHabits = {
  checks: { habitId: string; name: string; done: boolean }[];
  food: { prompt: string; note: string } | null;
};

/** The check habits of today and the food note, for the in-place quick-add panels. */
export async function loadQuickHabits(repos: Repositories, today: string): Promise<QuickHabits> {
  const view = buildHabitsView(await loadHabitsData(repos, today), today);
  return {
    checks: view.checks.map(({ habitId, name, done }) => ({ habitId, name, done })),
    food: view.food ? { prompt: view.food.prompt, note: view.food.note } : null,
  };
}
