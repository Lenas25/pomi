// Pure time-of-day helpers. A "clock" is an `HH:mm` string; a "minute of day" is 0..1439.

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
