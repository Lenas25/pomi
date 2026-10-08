// Body measurements (`metric_entries`) for the Progress tab. Pure.
import { differenceInCalendarDays, parseISO, startOfISOWeek, startOfMonth, format } from 'date-fns';

export type MetricFrequency = 'daily' | 'weekly' | 'monthly';

export type MetricPoint = { date: string; value: number };

/** Plausible ranges by unit; anything else is treated as a typo, not stored. */
const RANGES: Readonly<Record<string, { min: number; max: number }>> = {
  kg: { min: 20, max: 400 },
  cm: { min: 20, max: 300 },
};
const DEFAULT_RANGE = { min: 0.1, max: 100_000 };

export type ParsedMetric =
  { ok: true; value: number } | { ok: false; reason: 'empty' | 'notNumber' | 'outOfRange' };

/**
 * "61,5" and "61.5" both work; ONE decimal at most (a second one is a typo, not silently rounded).
 * The value is built from integer tenths, so no float multiplication can move a digit.
 */
export function parseMetricInput(text: string, unit: string): ParsedMetric {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const match = /^(\d{1,4})(?:[.,](\d))?$/.exec(trimmed);
  if (!match) return { ok: false, reason: 'notNumber' };
  const tenths = Number(match[1]) * 10 + Number(match[2] ?? 0);
  const value = tenths / 10;
  const range = RANGES[unit] ?? DEFAULT_RANGE;
  return value >= range.min && value <= range.max
    ? { ok: true, value }
    : { ok: false, reason: 'outOfRange' };
}

/** The most recent entry, or `undefined`. */
export function latestEntry(points: readonly MetricPoint[]): MetricPoint | undefined {
  return [...points].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

/**
 * Whether it is time for a new entry: weekly metrics once per ISO week, monthly once per calendar
 * month, daily once per day. A gentle prompt, never a miss.
 */
export function isEntryDue(
  frequency: MetricFrequency,
  today: string,
  lastDate: string | undefined,
): boolean {
  if (lastDate === undefined) return true;
  const now = parseISO(today);
  const last = parseISO(lastDate);
  switch (frequency) {
    case 'daily':
      return differenceInCalendarDays(now, last) >= 1;
    case 'weekly':
      return format(startOfISOWeek(now), 'yyyy-MM-dd') > format(startOfISOWeek(last), 'yyyy-MM-dd');
    case 'monthly':
      return format(startOfMonth(now), 'yyyy-MM-dd') > format(startOfMonth(last), 'yyyy-MM-dd');
  }
}
