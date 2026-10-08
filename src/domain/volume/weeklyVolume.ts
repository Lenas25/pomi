// Weekly volume per muscle (PLAN §9.4 "Volumen semanal por músculo"). Pure.
//
// Counting convention (docs/evidence/training.md, Pelland's fractional method): a completed set is
// 1 direct set for the FIRST muscle listed on its step and 0.5 for every other listed muscle
// (secondary movers). A step whose first muscle is unknown is skipped entirely. Weeks are ISO weeks (Monday start); a set belongs to the logical day
// `dayKeyFor(doneAt)`, so a set done at 00:30 counts for the day that was ending.
//
// The reference ranges are the evidence table already encoded in the generator params (single
// source). They are INFORMATION, never a goal: the UI words them as a general reference.
import { addWeeks, format, parseISO, startOfISOWeek } from 'date-fns';

import { MINOR_BAND, MINOR_MUSCLES, VOLUME } from '../generator/params';
import { MUSCLES, type Goal, type Level, type Muscle } from '../generator/types';
import { DAY_ROLLOVER_HOUR, dayKeyFor } from '../time';

export const DIRECT_WEIGHT = 1;
export const INDIRECT_WEIGHT = 0.5;
export const DEFAULT_VOLUME_WEEKS = 8;

/** A completed set: only its step and the moment it was done. */
export type VolumeSet = { stepId: string; doneAt: number };

/**
 * Muscles of a step. A plain list (program steps) means FIRST = direct, the rest indirect. The
 * explicit form (library fallback) lists every primary mover as direct and the secondary ones as
 * indirect, so an exercise with two primaries counts both as 1 set.
 */
export type StepMuscleSpec =
  readonly string[] | { readonly direct: readonly string[]; readonly indirect: readonly string[] };

/** Muscles by step id. Ids that are missing are ignored. */
export type StepMuscles = Readonly<Record<string, StepMuscleSpec>>;

export type VolumeWeek = {
  /** Monday of the ISO week, `yyyy-MM-dd`. */
  weekStart: string;
  /** The week that contains today (still in progress). */
  isCurrent: boolean;
  /** Direct-equivalent sets per muscle (multiples of 0.5); muscles without sets are absent. */
  sets: Partial<Record<Muscle, number>>;
};

const KNOWN = new Set<string>(MUSCLES);
const isMuscle = (value: string): value is Muscle => KNOWN.has(value);

const weekOf = (day: string) => format(startOfISOWeek(parseISO(day)), 'yyyy-MM-dd');

function splitMuscles(spec: StepMuscleSpec): { direct: Muscle[]; indirect: Muscle[] } {
  if (!Array.isArray(spec)) {
    const { direct, indirect } = spec as Exclude<StepMuscleSpec, readonly string[]>;
    const directSet = new Set(direct.filter(isMuscle));
    return {
      direct: [...directSet],
      indirect: [...new Set(indirect.filter(isMuscle))].filter((m) => !directSet.has(m)),
    };
  }
  // The direct muscle is the FIRST one listed. If that name is unknown the step is skipped:
  // promoting the next muscle to "direct" would count a set that was never meant for it.
  const [first, ...others] = [...new Set(spec as readonly string[])];
  if (first === undefined || !isMuscle(first)) return { direct: [], indirect: [] };
  return { direct: [first], indirect: others.filter(isMuscle) };
}

export type WeeklyVolumeInput = {
  /** Logical day `yyyy-MM-dd`. */
  today: string;
  /** Weeks to return, the current one included. */
  weeks?: number;
  sets: readonly VolumeSet[];
  stepMuscles: StepMuscles;
  rolloverHour?: number;
};

/** Oldest first; the last week is the current one. Sets outside the window are dropped. */
export function weeklyVolume(input: WeeklyVolumeInput): VolumeWeek[] {
  const total = Math.max(1, input.weeks ?? DEFAULT_VOLUME_WEEKS);
  const rollover = input.rolloverHour ?? DAY_ROLLOVER_HOUR;
  const currentStart = startOfISOWeek(parseISO(input.today));
  const weeks: VolumeWeek[] = Array.from({ length: total }, (_, index) => ({
    weekStart: format(addWeeks(currentStart, index - (total - 1)), 'yyyy-MM-dd'),
    isCurrent: index === total - 1,
    sets: {},
  }));
  const byStart = new Map(weeks.map((week) => [week.weekStart, week]));

  for (const set of input.sets) {
    const listed = input.stepMuscles[set.stepId];
    if (listed === undefined) continue;
    const week = byStart.get(weekOf(dayKeyFor(new Date(set.doneAt), rollover)));
    if (week === undefined) continue;
    const { direct, indirect } = splitMuscles(listed);
    for (const muscle of direct) week.sets[muscle] = (week.sets[muscle] ?? 0) + DIRECT_WEIGHT;
    for (const muscle of indirect) {
      week.sets[muscle] = (week.sets[muscle] ?? 0) + INDIRECT_WEIGHT;
    }
  }
  return weeks;
}

/** Muscles with any volume in the given weeks, in the canonical vocabulary order. */
export function musclesWithVolume(weeks: readonly VolumeWeek[]): Muscle[] {
  return MUSCLES.filter((muscle) => weeks.some((week) => (week.sets[muscle] ?? 0) > 0));
}

export type ReferenceRange = { min: number; max: number };

/**
 * General reference range of weekly direct-equivalent sets for a muscle, by goal and level
 * (E1/E12 table). The large muscles use the goal's band; the small ones the [DESIGN] minor band;
 * `espalda_alta` and `core` have no table, so no range (`null`).
 */
export function referenceRange(muscle: Muscle, level: Level, goal: Goal): ReferenceRange | null {
  if (MINOR_MUSCLES.includes(muscle)) {
    const { min, max } = MINOR_BAND[level];
    return { min, max };
  }
  if (muscle === 'espalda_alta' || muscle === 'core') return null;
  const { min, max } = VOLUME[goal][level];
  return { min, max };
}
