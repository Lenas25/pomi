// "Tú hace 30 días vs. hoy" (PLAN §10): what changed between the data of a month ago and the latest
// data. Pure. Language is descriptive and neutral (numbers and dates, never a judgment about the
// body); anything that cannot be compared honestly is simply left out.
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';

import type { MetricPoint } from './metrics';
import { exercisesWithStrength, strengthSeries, type SessionSets } from './strength';

export const COMPARE_DAYS = 30;
/** A measurement counts as "from a month ago" when it is within this many days of that date. */
export const COMPARE_TOLERANCE_DAYS = 15;

export type DatedValue = { date: string; value: number };

export type ValuePair = {
  from: DatedValue;
  to: DatedValue;
  /** `to - from`, one decimal. */
  change: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const daysBetween = (a: string, b: string) =>
  Math.abs(differenceInCalendarDays(parseISO(a), parseISO(b)));

/** The item closest in time to `target` within the tolerance (ties go to the earlier one). */
export function nearestTo<T extends { date: string }>(
  items: readonly T[],
  target: string,
  toleranceDays: number = COMPARE_TOLERANCE_DAYS,
): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    const distance = daysBetween(item.date, target);
    if (distance > toleranceDays) continue;
    if (best === undefined) best = item;
    else {
      const bestDistance = daysBetween(best.date, target);
      if (distance < bestDistance || (distance === bestDistance && item.date < best.date)) {
        best = item;
      }
    }
  }
  return best;
}

/**
 * The value near `thenDate` against the latest one. `null` unless there is a value near that date
 * AND a later one taken after it (a pair of old points is not "today").
 */
export function pairFor(points: readonly DatedValue[], thenDate: string): ValuePair | null {
  const from = nearestTo(points, thenDate);
  if (!from) return null;
  const later = points.filter((point) => point.date > thenDate && point.date > from.date);
  const to = [...later].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!to) return null;
  return { from, to, change: round1(to.value - from.value) };
}

export type ComparablePhoto = { id: number; date: string; pose: string; uri: string };

export type PosePair = {
  pose: string;
  /** Near a month ago. */
  then?: ComparablePhoto;
  /** The latest, taken after `then`. */
  now?: ComparablePhoto;
};

/** Per pose: the photo near `thenDate` and the latest one after it. Poses without photos are left out. */
export function photoPairs(
  photos: readonly ComparablePhoto[],
  poses: readonly string[],
  thenDate: string,
): PosePair[] {
  const result: PosePair[] = [];
  for (const pose of poses) {
    const own = photos.filter((photo) => photo.pose === pose);
    const then = nearestTo(own, thenDate);
    const now = [...own]
      .filter((photo) => photo.date > thenDate && photo.date > (then?.date ?? ''))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .at(-1);
    if (then || now) {
      result.push({
        pose,
        ...(then ? { then } : {}),
        ...(now ? { now } : {}),
      });
    }
  }
  return result;
}

export type MonthlyInput = {
  today: string;
  startedOn?: string | undefined;
  sessions: readonly (SessionSets & { date: string })[];
  habitDates: readonly string[];
  metrics: readonly { id: string; name: string; unit: string; entries: readonly MetricPoint[] }[];
  photos: readonly ComparablePhoto[];
  poses: readonly string[];
};

export type MonthlyComparison = {
  /** `today - 30 days`. */
  thenDate: string;
  /** Estimated 1RM of the best set, per exercise with a pair of values. */
  strength: (ValuePair & { stepId: string })[];
  measurements: (ValuePair & { metricId: string; name: string; unit: string })[];
  photos: PosePair[];
  consistency: {
    /** Gym sessions and days with habits in the last 30 days. */
    now: { sessions: number; habitDays: number };
    /** The 30 days before those; `null` when the person had not started yet. */
    before: { sessions: number; habitDays: number } | null;
  };
};

function countIn(dates: readonly string[], afterExclusive: string, untilInclusive: string): number {
  return new Set(dates.filter((date) => date > afterExclusive && date <= untilInclusive)).size;
}

export function buildMonthlyComparison(input: MonthlyInput): MonthlyComparison {
  const today = parseISO(input.today);
  const key = (date: Date) => format(date, 'yyyy-MM-dd');
  const thenDate = key(subDays(today, COMPARE_DAYS));
  const beforeStart = key(subDays(today, COMPARE_DAYS * 2));

  const strength = exercisesWithStrength(input.sessions).flatMap((stepId) => {
    const pair = pairFor(
      strengthSeries(input.sessions, stepId).map((point) => ({
        date: point.date,
        value: point.e1rm,
      })),
      thenDate,
    );
    return pair ? [{ ...pair, stepId }] : [];
  });

  const measurements = input.metrics.flatMap((metric) => {
    const pair = pairFor(metric.entries, thenDate);
    return pair ? [{ ...pair, metricId: metric.id, name: metric.name, unit: metric.unit }] : [];
  });

  const sessionDates = input.sessions.map((session) => session.date);
  const started = input.startedOn === undefined || input.startedOn <= thenDate;
  return {
    thenDate,
    strength,
    measurements,
    photos: photoPairs(input.photos, input.poses, thenDate),
    consistency: {
      now: {
        sessions: countIn(sessionDates, thenDate, input.today),
        habitDays: countIn(input.habitDates, thenDate, input.today),
      },
      before: started
        ? {
            sessions: countIn(sessionDates, beforeStart, thenDate),
            habitDays: countIn(input.habitDates, beforeStart, thenDate),
          }
        : null,
    },
  };
}

/** Whether there is anything to compare (otherwise the screen says "come back next month"). */
export function hasComparison(comparison: MonthlyComparison): boolean {
  return (
    comparison.strength.length > 0 ||
    comparison.measurements.length > 0 ||
    comparison.photos.some((pair) => pair.then !== undefined && pair.now !== undefined) ||
    (comparison.consistency.before !== null &&
      comparison.consistency.before.sessions + comparison.consistency.before.habitDays > 0)
  );
}
