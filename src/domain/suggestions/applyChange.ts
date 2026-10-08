// What accepting a suggestion changes, as a pure function of the current plan. The caller (the
// `src/suggestions` glue) writes the patch through the repositories in ONE transaction.
import { addDays, format, parseISO } from 'date-fns';

import type { Anchors, GymDays } from '../../templates/schema';
import type { PlanShifts } from '../agenda/buildAgenda';

import { BED_SHIFT_LIMIT_MIN, WATER_SHIFT_LIMIT_MIN } from './limits';
import type { SuggestionChange } from './types';

export type PlanGoals = {
  waterGlassesRest?: number | undefined;
  waterGlassesGym?: number | undefined;
  stepsGoal?: number | undefined;
};

export type PlanSnapshot = {
  /** `yyyy-MM-dd` the suggestion is accepted on. */
  today: string;
  anchors: Anchors;
  shifts: PlanShifts;
  gymDays: GymDays;
  goals: PlanGoals;
};

export type DeloadWeek = { startsOn: string; endsOn: string; pct: number };

/** Only the parts that change are present. */
export type PlanPatch = {
  anchors?: Anchors;
  shifts?: PlanShifts;
  gymDays?: GymDays;
  goals?: PlanGoals;
  deloadWeek?: DeloadWeek;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Moves `fromDay` to `toDay` inside the gym entry that held it (same morning / evening slot). */
export function moveGymDay(gymDays: GymDays, fromDay: number, toDay: number): GymDays {
  const holder = gymDays.find((entry) => entry.days.includes(fromDay));
  // The plan changed since the suggestion was made: nothing to move.
  if (!holder || gymDays.some((entry) => entry.days.includes(toDay))) return gymDays;
  return gymDays.map((entry) =>
    entry === holder
      ? {
          ...entry,
          days: entry.days.map((day) => (day === fromDay ? toDay : day)).sort((a, b) => a - b),
        }
      : entry,
  );
}

export function applyChange(change: SuggestionChange, plan: PlanSnapshot): PlanPatch {
  switch (change.type) {
    case 'bedtimeShift':
      return {
        shifts: { ...plan.shifts, bedMin: clamp(change.toMin, BED_SHIFT_LIMIT_MIN, 0) },
      };
    case 'waterShift':
      return {
        shifts: { ...plan.shifts, waterMin: clamp(change.toMin, WATER_SHIFT_LIMIT_MIN, 0) },
      };
    case 'wakeTime':
      return { anchors: { ...plan.anchors, wake: change.to } };
    case 'stepsGoal':
      return { goals: { ...plan.goals, stepsGoal: change.to } };
    case 'moveGymDay':
      return { gymDays: moveGymDay(plan.gymDays, change.fromDay, change.toDay) };
    case 'deload':
      return {
        deloadWeek: {
          startsOn: plan.today,
          // One week: today plus the next six days.
          endsOn: format(addDays(parseISO(plan.today), 6), 'yyyy-MM-dd'),
          pct: change.pct,
        },
      };
  }
}

export type StalenessContext = PlanSnapshot & {
  /** `yyyy-MM-dd` the suggestion was created on. */
  createdOn: string;
  /** Day the steps goal last changed (any way), when known. */
  goalsChangedOn?: string | undefined;
  /** A deload week is running right now. */
  deloadActive: boolean;
};

/**
 * Whether the plan moved on since the suggestion was made, so accepting it would be wrong or a
 * no-op: the value it starts `from` is not the current one, the weekday is gone, the wake time is
 * already set, a deload is already running.
 */
export function isChangeStale(change: SuggestionChange, plan: StalenessContext): boolean {
  switch (change.type) {
    case 'bedtimeShift':
      return (plan.shifts.bedMin ?? 0) !== change.fromMin;
    case 'waterShift':
      return (plan.shifts.waterMin ?? 0) !== change.fromMin;
    case 'wakeTime':
      return plan.anchors.wake === change.to;
    case 'stepsGoal':
      return (
        (plan.goals.stepsGoal !== undefined && plan.goals.stepsGoal !== change.from) ||
        (plan.goalsChangedOn !== undefined && plan.goalsChangedOn > plan.createdOn)
      );
    case 'moveGymDay':
      return moveGymDay(plan.gymDays, change.fromDay, change.toDay) === plan.gymDays;
    case 'deload':
      return plan.deloadActive;
  }
}
