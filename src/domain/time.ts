// Pure time helpers. A "clock" is an `HH:mm` string; a "minute of day" is 0..1439.
import { format } from 'date-fns';

export const MINUTES_PER_DAY = 1440;

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Wraps any number of minutes into 0..1439 (negative values and values past midnight included). */
export function wrapMinutes(minutes: number): number {
  return ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** `"05:10"` -> 310. Throws on anything that is not a valid `HH:mm`. */
export function clockToMinutes(clock: string): number {
  const match = CLOCK_PATTERN.exec(clock);
  if (!match) throw new RangeError(`Invalid clock "${clock}", expected HH:mm`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 310 -> `"05:10"`. Values outside 0..1439 wrap around midnight. */
export function minutesToClock(minutes: number): string {
  const wrapped = wrapMinutes(minutes);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Minutes elapsed going forward from `from` to `to` on the clock (0..1439), crossing midnight. */
export function forwardMinutes(from: string, to: string): number {
  return wrapMinutes(clockToMinutes(to) - clockToMinutes(from));
}

/**
 * Hour (local time) at which the logical day changes. Before it, a moment still belongs to the
 * previous day: a night check-in at 00:30 is part of the day that is ending (PLAN §10).
 */
export const DAY_ROLLOVER_HOUR = 4;

/** Local calendar date of the logical day of `date`, as the Date at local midnight. */
function logicalDate(date: Date, rolloverHour: number): Date {
  const back = date.getHours() < rolloverHour ? 1 : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
}

/**
 * The ONE place that turns a moment into the `yyyy-MM-dd` key logs are stored under (habits,
 * water, check-ins, activity, steps, Hoy, notifications, consistency). 03:59 still belongs to the
 * previous day, 04:00 starts the new one.
 */
export function dayKeyFor(date: Date, rolloverHour: number = DAY_ROLLOVER_HOUR): string {
  return format(logicalDate(date, rolloverHour), 'yyyy-MM-dd');
}

/** Local midnight that opens the logical day of `date` (the origin of the agenda minutes). */
export function dayStartFor(date: Date, rolloverHour: number = DAY_ROLLOVER_HOUR): Date {
  return logicalDate(date, rolloverHour);
}

/**
 * Minutes elapsed since the start of the logical day. Between midnight and the rollover this is
 * >= 1440, matching the agenda convention (bed 00:30 is minute 1470 of the day that is ending).
 */
export function minutesIntoDay(date: Date, rolloverHour: number = DAY_ROLLOVER_HOUR): number {
  const clock = date.getHours() * 60 + date.getMinutes();
  return date.getHours() < rolloverHour ? clock + MINUTES_PER_DAY : clock;
}
