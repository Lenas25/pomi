// Pure: the Health Connect read window for a range of LOGICAL days (04:00 rollover, PLAN §10).
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  setHours,
  startOfDay,
} from 'date-fns';

import { DAY_ROLLOVER_HOUR } from '../domain/time';

export type StepsWindow = {
  /** `from` day at 04:00 local. */
  start: Date;
  /** The day after `to`, at 04:00 local (exclusive end). */
  end: Date;
  /** Logical day keys `yyyy-MM-dd`, one per slice. */
  dates: string[];
};

/**
 * Logical day D covers D 04:00 -> D+1 03:59, the same rule as `dayKeyFor`. Slicing Health
 * Connect by calendar midnights would put the steps of 00:00-03:59 on the wrong day, so the window
 * is shifted by the rollover hour. The slice that STARTS on day D (`D T04:00`) is stored under D.
 * `null` when `to` is before `from`.
 */
export function stepsWindow(
  from: string,
  to: string,
  rolloverHour: number = DAY_ROLLOVER_HOUR,
): StepsWindow | null {
  const first = startOfDay(parseISO(from));
  const dayCount = differenceInCalendarDays(parseISO(to), first) + 1;
  if (dayCount < 1) return null;
  return {
    start: setHours(first, rolloverHour),
    end: setHours(addDays(first, dayCount), rolloverHour),
    dates: Array.from({ length: dayCount }, (_unused, index) =>
      format(addDays(first, index), 'yyyy-MM-dd'),
    ),
  };
}
