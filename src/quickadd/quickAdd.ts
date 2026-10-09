// Quick add ("Registrar"): the actions of the center tab bar button that write data directly.
// Pure over the repositories, so it is testable with the in-memory database.
import type { Repositories } from '../db/repositories';
import type { CheckinKind } from '../domain/habits/checkins';
import { loadHabitsData } from '../habits/habitsData';
import { buildHabitsView } from '../habits/habitsView';

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

export function checkinKindAt(hour: number): CheckinKind {
  return hour >= NIGHT_CHECKIN_FROM_HOUR ? 'night' : 'morning';
}
