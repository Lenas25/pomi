// "X de los últimos 10 días" (PLAN §13). Never a streak: a missed day only leaves a gap, nothing
// "breaks", and today (still in progress) is never counted against the person.
import { format, parseISO, subDays } from 'date-fns';

export const CONSISTENCY_WINDOW = 10;

export type ConsistencyDay = { date: string; done: boolean };

export type Consistency = {
  /** Days done inside the window. */
  done: number;
  /** Always the window length (10). */
  total: number;
  /** The counted days, oldest first. */
  days: ConsistencyDay[];
};

/**
 * The window is the last `window` days. While today is not done yet it ends YESTERDAY (so an
 * unfinished day never lowers the count); as soon as today is done it ends today.
 */
export function consistency(
  today: string,
  doneDates: Iterable<string>,
  window: number = CONSISTENCY_WINDOW,
): Consistency {
  const done = new Set(doneDates);
  const end = done.has(today) ? parseISO(today) : subDays(parseISO(today), 1);
  const days: ConsistencyDay[] = [];
  for (let offset = window - 1; offset >= 0; offset -= 1) {
    const date = format(subDays(end, offset), 'yyyy-MM-dd');
    days.push({ date, done: done.has(date) });
  }
  return { done: days.filter((day) => day.done).length, total: window, days };
}

export type DayValue = { date: string; value: number };

/**
 * Dates on which a habit counts as done. `targetFor(date)` is the day's goal: `null` or `<= 0`
 * means "no goal", where any positive value counts (checks use a target of 1).
 */
export function doneDates(
  entries: readonly DayValue[],
  targetFor: (date: string) => number | null,
): string[] {
  return entries
    .filter(({ date, value }) => {
      const target = targetFor(date);
      return value > 0 && (target === null || target <= 0 || value >= target);
    })
    .map(({ date }) => date);
}
