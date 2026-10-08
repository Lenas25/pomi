// Step goal with its baseline week (PLAN §9.2). During the first 7 days since `startedOn` the app
// only MEASURES; the goal is `baseline + 1000` (rounded to 500) computed from those first 7 days,
// so it is stable afterwards. A goal the person edited always wins. The weekly auto-adjustment is
// a suggestion (v2), never applied here.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

import { initialStepsGoal, stepsBaseline } from '../formulas/steps';

export const BASELINE_DAYS = 7;

export type StepsDay = { date: string; steps: number };

export type StepsPlanInput = {
  today: string;
  /** Day the person started (onboarding finished). Missing = today (day 0). */
  startedOn?: string | undefined;
  history: readonly StepsDay[];
  /** Onboarding answer, used while there is not enough measured data. */
  estimate?: number | undefined;
  /** Goal the person edited (settings `goals.stepsGoal`). */
  editedGoal?: number | undefined;
  cap?: number | undefined;
};

export type StepsPlan = {
  /** `baseline`: week 1, measuring. `active`: the goal is fixed. */
  phase: 'baseline' | 'active';
  /** Days of the baseline week still ahead (including today); 0 once it is over. */
  baselineDaysLeft: number;
  baseline: number | null;
  goal: number | null;
};

export function stepsPlan(input: StepsPlanInput): StepsPlan {
  const startedOn = input.startedOn ?? input.today;
  const dayIndex = Math.max(
    0,
    differenceInCalendarDays(parseISO(input.today), parseISO(startedOn)),
  );
  const phase = dayIndex < BASELINE_DAYS ? 'baseline' : 'active';

  const windowEnd = format(addDays(parseISO(startedOn), BASELINE_DAYS - 1), 'yyyy-MM-dd');
  const measured = input.history
    // A day with no steps recorded is a day without data (not a measured zero): it is ignored.
    .filter(({ date, steps }) => date >= startedOn && date <= windowEnd && steps > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ steps }) => steps);
  const baseline = stepsBaseline(measured, input.estimate);

  const goal =
    input.editedGoal ??
    (baseline === null ? null : initialStepsGoal(baseline, input.cap ?? undefined));

  return {
    phase,
    baselineDaysLeft: phase === 'baseline' ? BASELINE_DAYS - dayIndex : 0,
    baseline,
    goal,
  };
}
