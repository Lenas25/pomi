// Strength series for the Progress tab. Pure: sessions in, points out.
//
// The metric is the ESTIMATED one-rep max (e1RM) of the best set of each day, by the Epley
// formula: e1RM = weight x (1 + reps / 30). It rises when either the weight or the reps rise, so a
// double-progression program (more reps, then more kg) draws a single honest line, which the top
// weight alone would not. It is an ESTIMATE and the UI says so. Epley drifts above ~12 reps, so
// sets above `MAX_E1RM_REPS` and sets without a weight (bodyweight) are left out.
import { differenceInCalendarDays, parseISO } from 'date-fns';

export const MAX_E1RM_REPS = 12;

export type LoggedSet = {
  stepId: string;
  weightKg: number | null;
  reps: number | null;
};

export type SessionSets = { date: string; sets: readonly LoggedSet[] };

export type StrengthPoint = {
  /** Logical day `yyyy-MM-dd`. */
  date: string;
  /** Estimated one-rep max in kg, one decimal. */
  e1rm: number;
  /** Heaviest weight lifted that day with a usable set. */
  topWeightKg: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** `null` for a set that cannot be estimated (no weight, no reps, or beyond `MAX_E1RM_REPS`). */
export function epley1RM(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || reps === null) return null;
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > MAX_E1RM_REPS) return null;
  return round1(reps === 1 ? weightKg : weightKg * (1 + reps / 30));
}

/** One point per day for the step: the best e1RM of that day (sessions of one day are merged). */
export function strengthSeries(sessions: readonly SessionSets[], stepId: string): StrengthPoint[] {
  const byDate = new Map<string, StrengthPoint>();
  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.stepId !== stepId) continue;
      const e1rm = epley1RM(set.weightKg, set.reps);
      if (e1rm === null || set.weightKg === null) continue;
      const known = byDate.get(session.date);
      byDate.set(session.date, {
        date: session.date,
        e1rm: Math.max(known?.e1rm ?? 0, e1rm),
        topWeightKg: Math.max(known?.topWeightKg ?? 0, set.weightKg),
      });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Step ids with at least one estimable set, most data first (ties by id for a stable order). */
export function exercisesWithStrength(sessions: readonly SessionSets[]): string[] {
  const days = new Map<string, Set<string>>();
  for (const session of sessions) {
    for (const set of session.sets) {
      if (epley1RM(set.weightKg, set.reps) === null) continue;
      const set_ = days.get(set.stepId) ?? new Set<string>();
      set_.add(session.date);
      days.set(set.stepId, set_);
    }
  }
  return [...days]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([stepId]) => stepId);
}

export type SeriesSummary = {
  /** First and last value, in kg, as shown (one decimal). */
  from: number;
  to: number;
  /** Calendar days between the first and the last point. */
  spanDays: number;
};

/** "de 40 a 50 kg en 8 semanas": needs two points on different days, else `null`. */
export function summarizeSeries(
  points: readonly { date: string; value: number }[],
): SeriesSummary | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || first.date === last.date) return null;
  return {
    from: round1(first.value),
    to: round1(last.value),
    spanDays: differenceInCalendarDays(parseISO(last.date), parseISO(first.date)),
  };
}
