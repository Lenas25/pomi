// Consistency per week for the Progress tab. Pure. Weeks start on Monday (ISO) and every date is
// already a logical day key (`dayKeyFor` wrote it), so a 00:30 session counts for the day that was
// ending. Never a streak: a week with fewer sessions is just a shorter bar.
import { addWeeks, format, parseISO, startOfISOWeek } from 'date-fns';

import type { GymDays } from '../../templates/schema';

export type WeekBucket = {
  /** Monday of the week, `yyyy-MM-dd`. */
  weekStart: string;
  /** Finished gym sessions with at least one set. */
  sessionsDone: number;
  /** Gym days planned that week (distinct weekdays of its effective plan). */
  sessionsPlanned: number;
  /** Days of the week with any habit value logged (0..7). */
  habitDays: number;
  /** The week that contains today (still in progress). */
  isCurrent: boolean;
};

export const DEFAULT_WEEKS = 8;

const weekOf = (day: string) => format(startOfISOWeek(parseISO(day)), 'yyyy-MM-dd');

/** Distinct weekdays the person plans to train. */
export function plannedPerWeek(gymDays: GymDays): number {
  return new Set(gymDays.flatMap((entry) => entry.days)).size;
}

export type WeeklyInput = {
  today: string;
  /** How many weeks to show, the current one included. */
  weeks?: number;
  /** First day of use: earlier weeks are not shown (they were not "missed"). */
  startedOn?: string | undefined;
  sessionDates: readonly string[];
  habitDates: readonly string[];
  planned: number;
  /** Planned gym days of the week starting on `weekStart` (week overrides); `planned` otherwise. */
  plannedFor?: ((weekStart: string) => number) | undefined;
};

/** Oldest first; the last bucket is the current week. */
export function weeklyBuckets(input: WeeklyInput): WeekBucket[] {
  const { today, startedOn, planned } = input;
  const total = input.weeks ?? DEFAULT_WEEKS;
  const currentStart = startOfISOWeek(parseISO(today));
  const firstShown = startedOn !== undefined ? weekOf(startedOn) : '';

  const sessionsByWeek = new Map<string, number>();
  for (const date of input.sessionDates) {
    const week = weekOf(date);
    sessionsByWeek.set(week, (sessionsByWeek.get(week) ?? 0) + 1);
  }
  const habitDaysByWeek = new Map<string, Set<string>>();
  for (const date of input.habitDates) {
    const week = weekOf(date);
    const days = habitDaysByWeek.get(week) ?? new Set<string>();
    days.add(date);
    habitDaysByWeek.set(week, days);
  }

  const buckets: WeekBucket[] = [];
  for (let back = total - 1; back >= 0; back -= 1) {
    const weekStart = format(addWeeks(currentStart, -back), 'yyyy-MM-dd');
    if (weekStart < firstShown) continue;
    buckets.push({
      weekStart,
      sessionsDone: sessionsByWeek.get(weekStart) ?? 0,
      sessionsPlanned: input.plannedFor ? input.plannedFor(weekStart) : planned,
      habitDays: habitDaysByWeek.get(weekStart)?.size ?? 0,
      isCurrent: back === 0,
    });
  }
  return buckets;
}

/** Whether any bucket has something to show (otherwise the section is an empty state). */
export function hasWeeklyData(buckets: readonly WeekBucket[]): boolean {
  return buckets.some((bucket) => bucket.sessionsDone > 0 || bucket.habitDays > 0);
}
