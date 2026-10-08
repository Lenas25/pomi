// Daily water target (PLAN §9.1), gym-day aware. The glasses the person accepted or edited on the
// onboarding summary win; otherwise the formula runs for that specific day.
import { getDay, parseISO } from 'date-fns';

import type { GymDays, GymPlan } from '../../templates/schema';
import { DEFAULT_GLASS_ML, waterGoal } from '../formulas/water';
import { effectiveGymPlan, type GymPlanSettings, type GymWeekPlans } from '../gym/gymPlan';

/** One hour of gym per session, as in the agenda and the onboarding summary. */
const GYM_HOURS_PER_SESSION = 1;

export type WaterTargetInput = {
  weightKg?: number | undefined;
  gymDays: GymDays;
  /** Per-day plan and week overrides: with them the gym day follows `effectiveGymPlan(date)`. */
  gymPlan?: GymPlan | undefined;
  gymWeekPlans?: GymWeekPlans | undefined;
  glassMl?: number | undefined;
  /** Accepted goals (settings `goals`). */
  goals?: { waterGlassesRest?: number | undefined; waterGlassesGym?: number | undefined };
};

export type WaterTarget = { glasses: number; ml: number; glassMl: number; gymDay: boolean };

/**
 * Number of gym sessions planned on `date` (`yyyy-MM-dd`, logical day key): the week override
 * when there is one, else the usual plan (`effectiveGymPlan`). A bare `GymDays` is the usual plan.
 */
export function gymSessionsOn(date: string, gym: GymDays | GymPlanSettings): number {
  const weekday = getDay(parseISO(date));
  const settings: GymPlanSettings = Array.isArray(gym) ? { gymDays: gym } : gym;
  return effectiveGymPlan(settings, date).filter((entry) => entry.weekday === weekday).length;
}

/** `null` when there is neither an accepted goal nor a weight to compute from. */
export function waterTargetFor(date: string, input: WaterTargetInput): WaterTarget | null {
  const sessions = gymSessionsOn(date, {
    gymDays: input.gymDays,
    gymPlan: input.gymPlan,
    gymWeekPlans: input.gymWeekPlans,
  });
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
