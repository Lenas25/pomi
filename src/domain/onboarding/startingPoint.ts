// "Tu punto de partida" (PLAN §8): goals computed from the draft with the pure formulas, each with
// the i18n key + params that explain where the number comes from. No text is produced here.
import { sleepCycleBedtimes, bedtimeFor, type SleepCycleOption } from '../formulas/sleep';
import { initialStepsGoal, stepsBaseline } from '../formulas/steps';
import { DEFAULT_GLASS_ML, waterGoal } from '../formulas/water';
import type { OnboardingDraft } from './draft';

type Params = Record<string, string | number>;

export type StartingPointKey =
  | 'onboarding.summary.waterExplain'
  | 'onboarding.summary.waterNoWeight'
  | 'onboarding.summary.stepsExplain'
  | 'onboarding.summary.stepsNoBaseline'
  | 'onboarding.summary.sleepExplain'
  | 'onboarding.summary.sleepNoWake'
  | 'onboarding.summary.gymExplain'
  | 'onboarding.summary.gymNone';

export type Explanation = { key: StartingPointKey; params: Params };

export type GoalValue = {
  /** Value shown (the override when the person edited it). */
  value: number;
  /** What the formula proposed. */
  suggested: number;
  edited: boolean;
};

export type StartingPoint = {
  water: {
    restGlasses: GoalValue;
    gymGlasses: GoalValue;
    glassMl: number;
    explanation: Explanation;
    /** No weight: the numbers are a neutral starting point to edit, not a computed goal. */
    fromDefault: boolean;
  };
  /** Rows to show even when the weight is missing, so the screen can explain what is needed. */
  waterExplanation: Explanation;
  steps: { goal: GoalValue | null; baseline: number | null; explanation: Explanation };
  sleep: {
    targetH: number;
    bedtime: string | null;
    cycles: SleepCycleOption[];
    explanation: Explanation;
  };
  gym: { days: number[]; explanation: Explanation };
};

/** Neutral glasses per day offered when there is no weight to compute from (editable). */
export const DEFAULT_WATER_GLASSES = { rest: 8, gym: 10 } as const;

/** One hour of gym per session, as everywhere else (PLAN §9.1). */
const GYM_HOURS = 1;

function goalValue(suggested: number, override: number | undefined): GoalValue {
  return override === undefined
    ? { value: suggested, suggested, edited: false }
    : { value: override, suggested, edited: override !== suggested };
}

export function buildStartingPoint(draft: OnboardingDraft): StartingPoint {
  const { goalOverrides } = draft;

  let waterExplanation: Explanation = { key: 'onboarding.summary.waterNoWeight', params: {} };
  let water: StartingPoint['water'] = {
    restGlasses: goalValue(DEFAULT_WATER_GLASSES.rest, goalOverrides.waterRestGlasses),
    gymGlasses: goalValue(DEFAULT_WATER_GLASSES.gym, goalOverrides.waterGymGlasses),
    glassMl: DEFAULT_GLASS_ML,
    explanation: waterExplanation,
    fromDefault: true,
  };
  if (draft.weightKg !== undefined) {
    const rest = waterGoal({ weightKg: draft.weightKg });
    const gym = waterGoal({ weightKg: draft.weightKg, gymHours: GYM_HOURS });
    waterExplanation = {
      key: 'onboarding.summary.waterExplain',
      params: { kg: draft.weightKg, rawMl: Math.round(rest.rawMl), glassMl: DEFAULT_GLASS_ML },
    };
    water = {
      restGlasses: goalValue(rest.glasses, goalOverrides.waterRestGlasses),
      gymGlasses: goalValue(gym.glasses, goalOverrides.waterGymGlasses),
      glassMl: DEFAULT_GLASS_ML,
      explanation: waterExplanation,
      fromDefault: false,
    };
  }

  const baseline = stepsBaseline([], draft.stepsEstimate);
  const stepsSuggested = baseline === null ? null : initialStepsGoal(baseline);
  const steps: StartingPoint['steps'] = {
    goal: stepsSuggested === null ? null : goalValue(stepsSuggested, goalOverrides.stepsGoal),
    baseline,
    explanation:
      baseline === null
        ? { key: 'onboarding.summary.stepsNoBaseline', params: {} }
        : { key: 'onboarding.summary.stepsExplain', params: { baseline } },
  };

  const bedtime = draft.wake ? bedtimeFor(draft.wake, draft.sleepTargetH) : null;
  const sleep: StartingPoint['sleep'] = {
    targetH: draft.sleepTargetH,
    bedtime,
    cycles: draft.wake ? sleepCycleBedtimes(draft.wake) : [],
    explanation:
      draft.wake && bedtime
        ? {
            key: 'onboarding.summary.sleepExplain',
            params: { wake: draft.wake, hours: draft.sleepTargetH, bedtime },
          }
        : { key: 'onboarding.summary.sleepNoWake', params: { hours: draft.sleepTargetH } },
  };

  const days = [...draft.gymDays].sort((a, b) => a - b);
  const gym: StartingPoint['gym'] = {
    days,
    explanation:
      days.length === 0
        ? { key: 'onboarding.summary.gymNone', params: {} }
        : { key: 'onboarding.summary.gymExplain', params: { count: days.length } },
  };

  return { water, waterExplanation, steps, sleep, gym };
}
