// PLAN §9.2. Step baseline, initial goal and the weekly adjustment PROPOSAL.

export const DEFAULT_STEPS_CAP = 10000;
export const STEPS_ROUNDING = 500;
export const STEPS_INITIAL_BONUS = 1000;
export const STEPS_ADJUST = 500;
/** Fewest days of data accepted as a measured baseline; fewer falls back to the onboarding answer. */
export const MIN_BASELINE_DAYS = 3;

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Baseline = average of the last 7 days of steps. With fewer than `MIN_BASELINE_DAYS` days the
 * onboarding answer wins; with neither, returns the average of whatever data exists, or `null`.
 * `dailySteps` is ordered oldest -> newest.
 */
export function stepsBaseline(
  dailySteps: readonly number[],
  onboardingAnswer?: number | null,
): number | null {
  const recent = dailySteps.slice(-7).filter((steps) => Number.isFinite(steps) && steps >= 0);
  const average = (values: readonly number[]) =>
    Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  if (recent.length >= MIN_BASELINE_DAYS) return average(recent);
  if (onboardingAnswer != null && onboardingAnswer >= 0) return Math.round(onboardingAnswer);
  return recent.length > 0 ? average(recent) : null;
}

/** Initial goal = baseline + 1,000 rounded to the nearest 500, never above `cap`. */
export function initialStepsGoal(baseline: number, cap: number = DEFAULT_STEPS_CAP): number {
  if (!Number.isFinite(baseline) || baseline < 0) throw new RangeError('baseline must be >= 0');
  return Math.min(roundToNearest(baseline + STEPS_INITIAL_BONUS, STEPS_ROUNDING), cap);
}

/** Days (out of the given ones) on which the goal was reached. */
export function daysGoalMet(dailySteps: readonly number[], goal: number): number {
  return dailySteps.filter((steps) => steps >= goal).length;
}

export type StepsAdjustmentInput = {
  currentGoal: number;
  baseline: number;
  cap?: number;
  /** Days the goal was met in the week that just ended (0..7). */
  daysMetThisWeek: number;
  /**
   * Days met in the week before. Pass `undefined` when that week had no data or the goal changed
   * since, so a lowering never counts weeks from before the last change.
   */
  daysMetPreviousWeek?: number;
};

export type StepsAdjustment =
  { kind: 'raise'; newGoal: number } | { kind: 'lower'; newGoal: number } | { kind: 'keep' };

/**
 * Weekly adjustment PROPOSAL. Pure: it never applies anything; the suggestions engine (v2) shows
 * it and the person must accept. Rules:
 *  - 5+ of 7 days met -> raise by 500 (up to the cap).
 *  - fewer than 3 days met two weeks in a row -> lower by 500, never below the baseline.
 */
export function proposeStepsAdjustment({
  currentGoal,
  baseline,
  cap = DEFAULT_STEPS_CAP,
  daysMetThisWeek,
  daysMetPreviousWeek,
}: StepsAdjustmentInput): StepsAdjustment {
  if (daysMetThisWeek >= 5) {
    const newGoal = Math.min(currentGoal + STEPS_ADJUST, cap);
    return newGoal > currentGoal ? { kind: 'raise', newGoal } : { kind: 'keep' };
  }
  if (daysMetThisWeek < 3 && daysMetPreviousWeek !== undefined && daysMetPreviousWeek < 3) {
    const newGoal = Math.max(currentGoal - STEPS_ADJUST, baseline);
    return newGoal < currentGoal ? { kind: 'lower', newGoal } : { kind: 'keep' };
  }
  return { kind: 'keep' };
}
