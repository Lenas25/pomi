// Daily water target (PLAN §9.1), gym-day aware. The glasses the person accepted or edited on the
// onboarding summary win; otherwise the formula runs for that specific day.
import { getDay, parseISO } from 'date-fns';

import type { GymDays } from '../../templates/schema';
import { DEFAULT_GLASS_ML, waterGoal } from '../formulas/water';

/** One hour of gym per session, as in the agenda and the onboarding summary. */
const GYM_HOURS_PER_SESSION = 1;

export type WaterTargetInput = {
  weightKg?: number | undefined;
  gymDays: GymDays;
  glassMl?: number | undefined;
  /** Accepted goals (settings `goals`). */
  goals?: { waterGlassesRest?: number | undefined; waterGlassesGym?: number | undefined };
};

export type WaterTarget = { glasses: number; ml: number; glassMl: number; gymDay: boolean };

/** Number of gym sessions scheduled on the weekday of `date` (`yyyy-MM-dd`). */
export function gymSessionsOn(date: string, gymDays: GymDays): number {
  const weekday = getDay(parseISO(date));
  return gymDays.filter((entry) => entry.days.includes(weekday)).length;
}

/** `null` when there is neither an accepted goal nor a weight to compute from. */
export function waterTargetFor(date: string, input: WaterTargetInput): WaterTarget | null {
  const sessions = gymSessionsOn(date, input.gymDays);
  const gymDay = sessions > 0;
  const glassMl = input.glassMl ?? DEFAULT_GLASS_ML;

  const accepted = gymDay ? input.goals?.waterGlassesGym : input.goals?.waterGlassesRest;
  if (accepted !== undefined) {
    return { glasses: accepted, ml: accepted * glassMl, glassMl, gymDay };
  }
  if (input.weightKg === undefined) return null;
  const goal = waterGoal({
    weightKg: input.weightKg,
    gymHours: sessions * GYM_HOURS_PER_SESSION,
    glassMl,
  });
  return { glasses: goal.glasses, ml: goal.ml, glassMl, gymDay };
}
