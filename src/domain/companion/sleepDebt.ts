// Sleep debt (PLAN §14b): over the last 7 days, sum of (target - slept) per night, where a night
// longer than the target gives back at most 60 minutes (one long night does not erase a short week).
import { addDays, format, parseISO } from 'date-fns';

import { sleepDurationMin, type MorningCheckin } from '../formulas/sleep';

import { SLEEP_DEBT_MIN_DAYS, SLEEP_DEBT_WINDOW_DAYS, SLEEP_SURPLUS_CAP_MIN } from './limits';

export type SleepDebt = {
  /** Nights with data inside the window. */
  days: number;
  targetMin: number;
  /** Minutes missing, never negative. */
  debtMin: number;
};

/** `yyyy-MM-dd` moved by `offset` days. */
export function shiftDay(date: string, offset: number): string {
  return format(addDays(parseISO(date), offset), 'yyyy-MM-dd');
}

/** The newest check-in per date, in the window `[today - (days - 1), today]`. */
export function nightsInWindow(
  nights: readonly MorningCheckin[],
  today: string,
  days: number,
): MorningCheckin[] {
  const from = shiftDay(today, -(days - 1));
  const byDate = new Map<string, MorningCheckin>();
  for (const night of nights) {
    if (night.date >= from && night.date <= today) byDate.set(night.date, night);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * `null` when the target is unknown or fewer than 4 of the last 7 mornings have data (no number is
 * invented from a couple of nights).
 */
export function sleepDebt(
  nights: readonly MorningCheckin[],
  targetMin: number | undefined,
  today: string,
): SleepDebt | null {
  if (targetMin === undefined || !Number.isFinite(targetMin) || targetMin <= 0) return null;
  const recent = nightsInWindow(nights, today, SLEEP_DEBT_WINDOW_DAYS);
  if (recent.length < SLEEP_DEBT_MIN_DAYS) return null;

  let balance = 0;
  for (const night of recent) {
    const missing = targetMin - sleepDurationMin(night.bed, night.wake);
    balance += Math.max(missing, -SLEEP_SURPLUS_CAP_MIN);
  }
  return { days: recent.length, targetMin, debtMin: Math.max(0, Math.round(balance)) };
}
