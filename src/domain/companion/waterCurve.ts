// Water curve by hour (PLAN §14b) from the write events of `habit_events` (last 14 finished days):
// the average cumulative glasses per hour, plus the afternoon gap: 3 hours in a row, awake and
// between 12:00 and 19:00, with no glass logged on at least 5 of every 7 recorded days. The result
// is information for a SUGGESTION (the existing "waterEarlier" one), never an automatic change.
import { minutesIntoDay } from '../time';

import {
  WATER_CHART_FROM_HOUR,
  WATER_CHART_TO_HOUR,
  WATER_CURVE_MIN_DAYS,
  WATER_CURVE_WINDOW_DAYS,
  WATER_GAP_FROM_HOUR,
  WATER_GAP_HOURS,
  WATER_GAP_SHARE,
  WATER_GAP_TO_HOUR,
} from './limits';
import { shiftDay } from './sleepDebt';

/** One write of the counter: the logical day, when (epoch ms) and the value after it. */
export type WaterEventRow = { date: string; at: number; value: number };

export type WaterCurveInput = {
  events: readonly WaterEventRow[];
  /** Today's day key; today is left out (it is not finished). */
  today: string;
  /** Glasses goal by day key: a day whose goal was already met before a window is not a gap day. */
  targets?: Readonly<Record<string, number>>;
  /** Awake window in minutes of the logical day; a gap must fit inside it. */
  wakeMin?: number | undefined;
  bedMin?: number | undefined;
};

export type WaterCurve = {
  /** Days with at least one write. */
  days: number;
  /** Average glasses logged by the END of each hour, from 06:00 to 22:00. */
  byHour: { hour: number; glasses: number }[];
  /** `[fromHour, toHour)` of the afternoon gap, or `null`. */
  gap: { fromHour: number; toHour: number } | null;
};

type DayWrites = {
  /** Value after the last write at or before the end of each hour (index = hour). */
  atEndOfHour: number[];
  /** Hours (logical, 0-27) in which the counter went UP. */
  writeHours: Set<number>;
  target: number | undefined;
};

const HOURS = 28;

function summarizeDay(events: readonly WaterEventRow[], target: number | undefined): DayWrites {
  const sorted = events
    .map((event) => ({
      minute: minutesIntoDay(new Date(event.at)),
      value: event.value,
      at: event.at,
    }))
    .sort((a, b) => a.at - b.at);
  const writeHours = new Set<number>();
  let previous = 0;
  for (const event of sorted) {
    if (event.value > previous) writeHours.add(Math.floor(event.minute / 60));
    previous = event.value;
  }
  const atEndOfHour = Array.from({ length: HOURS }, (_, hour) => {
    let value = 0;
    for (const event of sorted) if (event.minute < (hour + 1) * 60) value = event.value;
    return value;
  });
  return { atEndOfHour, writeHours, target };
}

function detectGap(
  days: readonly DayWrites[],
  wakeMin: number | undefined,
  bedMin: number | undefined,
): WaterCurve['gap'] {
  const qualifying: number[] = [];
  for (let start = WATER_GAP_FROM_HOUR; start + WATER_GAP_HOURS <= WATER_GAP_TO_HOUR; start += 1) {
    if (wakeMin !== undefined && start * 60 < wakeMin) continue;
    if (bedMin !== undefined && (start + WATER_GAP_HOURS) * 60 > bedMin) continue;
    const empty = days.filter((day) => {
      for (let hour = start; hour < start + WATER_GAP_HOURS; hour += 1) {
        if (day.writeHours.has(hour)) return false;
      }
      // A day that already met its goal before the window has nothing to catch up on.
      const before = start === 0 ? 0 : (day.atEndOfHour[start - 1] ?? 0);
      return day.target === undefined || before < day.target;
    }).length;
    if (empty / days.length >= WATER_GAP_SHARE) qualifying.push(start);
  }
  const first = qualifying[0];
  if (first === undefined) return null;
  // Consecutive qualifying starts are one longer gap.
  let last = first;
  for (const start of qualifying) {
    if (start <= last + 1) last = start;
    else break;
  }
  return { fromHour: first, toHour: last + WATER_GAP_HOURS };
}

/** `null` with fewer than 7 recorded days in the last 14 finished days. */
export function waterCurve(input: WaterCurveInput): WaterCurve | null {
  const { events, today, targets = {}, wakeMin, bedMin } = input;
  const from = shiftDay(today, -WATER_CURVE_WINDOW_DAYS);
  const to = shiftDay(today, -1);

  const byDate = new Map<string, WaterEventRow[]>();
  for (const event of events) {
    if (event.date < from || event.date > to) continue;
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  }
  if (byDate.size < WATER_CURVE_MIN_DAYS) return null;

  const days = [...byDate.entries()].map(([date, rows]) => summarizeDay(rows, targets[date]));
  const byHour = [];
  for (let hour = WATER_CHART_FROM_HOUR; hour <= WATER_CHART_TO_HOUR; hour += 1) {
    const total = days.reduce((sum, day) => sum + (day.atEndOfHour[hour] ?? 0), 0);
    byHour.push({ hour, glasses: Math.round((total / days.length) * 10) / 10 });
  }
  return { days: days.length, byHour, gap: detectGap(days, wakeMin, bedMin) };
}
