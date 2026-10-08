// Answers collected by the onboarding ("Conocerte", PLAN §8). Pure data: the UI keeps them in a
// small store, `mapDraftToPersistence` turns them into profile / settings rows.
import { clockToMinutes } from '../time';

/** Values stored in `profile.workType`; `buildAgenda` filters habits with `profile.workType`. */
export const WORK_TYPES = ['sentada', 'de pie', 'activa'] as const;
export const LEVELS = ['principiante', 'intermedio', 'avanzado'] as const;
export const GOALS = ['musculo', 'fuerza', 'grasa', 'salud'] as const;
export const GYM_SLOTS = ['gymMorning', 'gymEvening'] as const;

export type WorkType = (typeof WORK_TYPES)[number];
export type Level = (typeof LEVELS)[number];
export type Goal = (typeof GOALS)[number];
export type GymSlot = (typeof GYM_SLOTS)[number];

/** Defaults offered by the UI (the author's template uses the same anchors). */
export const DEFAULT_SLEEP_TARGET_H = 7.5;
export const DEFAULT_GYM_TIMES: Record<GymSlot, string> = {
  gymMorning: '06:00',
  gymEvening: '18:00',
};

/** Initial positions of the clock steppers; they only become answers when the person continues. */
export const DEFAULT_WAKE = '06:30';
export const DEFAULT_BED = '23:00';
/** Starting point of the "steps per day" stepper. */
export const DEFAULT_STEPS_ESTIMATE = 5000;

export const LIMITS = {
  weightKg: { min: 20, max: 300 },
  heightCm: { min: 80, max: 250 },
  ageYears: { min: 10, max: 100 },
  sleepTargetH: { min: 4, max: 12 },
  steps: { min: 0, max: 40000 },
} as const;

export type GoalOverrides = {
  waterRestGlasses?: number;
  waterGymGlasses?: number;
  stepsGoal?: number;
};

export type OnboardingDraft = {
  name?: string;
  weightKg?: number;
  heightCm?: number;
  ageYears?: number;
  workType?: WorkType;
  /** Usual wake time `HH:mm`. */
  wake?: string;
  /** Usual bedtime `HH:mm`. Only used to show how much the person sleeps now; bedtime is derived. */
  bed?: string;
  sleepTargetH: number;
  /** Weekdays 0 (Sunday) to 6 (Saturday). */
  gymDays: number[];
  /** Which anchor each gym day uses. Days without an entry default to the morning. */
  gymSlots: Partial<Record<number, GymSlot>>;
  gymMorning: string;
  gymEvening: string;
  level?: Level;
  goal?: Goal;
  /** Rough answer to "how many steps do you take a day?". */
  stepsEstimate?: number;
  checkinMorning: boolean;
  checkinNight: boolean;
  goalOverrides: GoalOverrides;
};

export function emptyDraft(): OnboardingDraft {
  return {
    sleepTargetH: DEFAULT_SLEEP_TARGET_H,
    gymDays: [],
    gymSlots: {},
    gymMorning: DEFAULT_GYM_TIMES.gymMorning,
    gymEvening: DEFAULT_GYM_TIMES.gymEvening,
    checkinMorning: true,
    checkinNight: true,
    goalOverrides: {},
  };
}

/**
 * Merges `patch` into `draft` and drops the goal overrides whose inputs changed: a water goal the
 * person edited for the OLD weight (or a steps goal for the old estimate) must not survive a new
 * answer. Sleep has no override (the target hours ARE the editable value), so wake / bed changes
 * need nothing here.
 */
export function applyDraftPatch(
  draft: OnboardingDraft,
  patch: Partial<OnboardingDraft>,
): OnboardingDraft {
  const next = { ...draft, ...patch };
  const overrides = { ...next.goalOverrides };
  if ('weightKg' in patch && patch.weightKg !== draft.weightKg) {
    delete overrides.waterRestGlasses;
    delete overrides.waterGymGlasses;
  }
  if ('stepsEstimate' in patch && patch.stepsEstimate !== draft.stepsEstimate) {
    delete overrides.stepsGoal;
  }
  return { ...next, goalOverrides: overrides };
}

/** Slot used by a gym day (morning unless chosen otherwise). */
export function slotOf(draft: Pick<OnboardingDraft, 'gymSlots'>, day: number): GymSlot {
  return draft.gymSlots[day] ?? 'gymMorning';
}

/** Hours the person currently sleeps (usual bedtime to usual wake time), when both are known. */
export function currentSleepHours(draft: Pick<OnboardingDraft, 'wake' | 'bed'>): number | null {
  if (!draft.wake || !draft.bed) return null;
  const minutes = (clockToMinutes(draft.wake) - clockToMinutes(draft.bed) + 1440) % 1440;
  return Math.round((minutes / 60) * 2) / 2;
}

// --- Parsing and validation of typed answers --------------------------------------------------

/** Parses "60", "60.5" or "60,5". Returns `undefined` for anything else (including empty text). */
export function parseDecimal(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return undefined;
  return Number(normalized);
}

export function isInRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

export type OptionalNumber = { ok: true; value: number | undefined } | { ok: false };

/**
 * Reads an optional typed number. Empty text is a valid "no answer"; anything else must parse and
 * fall in `range` (and be a whole number when `integer` is set).
 */
export function parseOptionalNumber(
  text: string,
  range: { min: number; max: number },
  integer = false,
): OptionalNumber {
  if (text.trim() === '') return { ok: true, value: undefined };
  const value = parseDecimal(text);
  if (value === undefined || !isInRange(value, range)) return { ok: false };
  if (integer && !Number.isInteger(value)) return { ok: false };
  return { ok: true, value };
}
