import type { Anchors, CheckinPrefs, GymDays } from '../../templates/schema';
import {
  slotOf,
  type GymSlot,
  type Goal,
  type Level,
  type OnboardingDraft,
  type WorkType,
} from './draft';
import { buildStartingPoint } from './startingPoint';

/** Fields of the single `profile` row; skipped answers are simply absent. */
export type ProfilePatch = {
  weightKg?: number;
  heightCm?: number;
  ageYears?: number;
  workType?: WorkType;
  level?: Level;
  goal?: Goal;
};

/** Goals the person accepted (or edited) on "Tu punto de partida". */
export type StoredGoals = {
  waterGlassesRest?: number;
  waterGlassesGym?: number;
  stepsGoal?: number;
};

export type SettingsPatch = {
  userName?: string;
  anchors: Anchors;
  gymDays: GymDays;
  checkinPrefs: CheckinPrefs;
  stepsEstimate?: number;
  goals: StoredGoals;
};

export type OnboardingPersistence = { profile: ProfilePatch; settings: SettingsPatch };

export const DEFAULT_MONTHLY_REVIEW_DAY = 1;

/**
 * Pure mapping from the onboarding answers to what the repositories store. Gym days are grouped
 * by slot: `gymMorning` / `gymEvening` anchors only exist when some day uses them. Bedtime is not
 * stored (it is derived: wake − sleepTargetH).
 */
export function mapDraftToPersistence(draft: OnboardingDraft): OnboardingPersistence {
  const profile: ProfilePatch = {};
  if (draft.weightKg !== undefined) profile.weightKg = draft.weightKg;
  if (draft.heightCm !== undefined) profile.heightCm = draft.heightCm;
  if (draft.ageYears !== undefined) profile.ageYears = draft.ageYears;
  if (draft.workType !== undefined) profile.workType = draft.workType;
  if (draft.level !== undefined) profile.level = draft.level;
  if (draft.goal !== undefined) profile.goal = draft.goal;

  const days = [...new Set(draft.gymDays)].sort((a, b) => a - b);
  const bySlot = (slot: GymSlot) => days.filter((day) => slotOf(draft, day) === slot);
  const morning = bySlot('gymMorning');
  const evening = bySlot('gymEvening');

  const gymDays: GymDays = [];
  const anchors: Anchors = { sleepTargetH: draft.sleepTargetH };
  if (draft.wake !== undefined) anchors.wake = draft.wake;
  if (morning.length > 0) {
    gymDays.push({ days: morning, anchor: 'gymMorning' });
    anchors.gymMorning = draft.gymMorning;
  }
  if (evening.length > 0) {
    gymDays.push({ days: evening, anchor: 'gymEvening' });
    anchors.gymEvening = draft.gymEvening;
  }

  const point = buildStartingPoint({ ...draft, gymDays: days });
  const goals: StoredGoals = {};
  // Without a weight the water numbers are only a starting point: store them when edited.
  if (!point.water.fromDefault || point.water.restGlasses.edited) {
    goals.waterGlassesRest = point.water.restGlasses.value;
  }
  if (!point.water.fromDefault || point.water.gymGlasses.edited) {
    goals.waterGlassesGym = point.water.gymGlasses.value;
  }
  if (point.steps.goal) goals.stepsGoal = point.steps.goal.value;

  const settings: SettingsPatch = {
    anchors,
    gymDays,
    checkinPrefs: {
      morning: draft.checkinMorning,
      night: draft.checkinNight,
      monthlyReviewDay: DEFAULT_MONTHLY_REVIEW_DAY,
    },
    goals,
  };
  const name = draft.name?.trim();
  if (name) settings.userName = name;
  if (draft.stepsEstimate !== undefined) settings.stepsEstimate = draft.stepsEstimate;

  return { profile, settings };
}
