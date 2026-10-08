// Types of the rule-based suggestions engine (PLAN §11). Pure data: the engine returns i18n KEYS
// and numbers, never text.
import type { Anchors, GymDays } from '../../templates/schema';
import type { PlanShifts } from '../agenda/buildAgenda';
import type { MorningCheckin } from '../formulas/sleep';
import type { ExerciseSession, TargetRules } from '../gym/todayTarget';
import type { StepsPlan } from '../habits/stepsPlan';

/**
 * Rule kinds in PRIORITY order (first wins the weekly slots). Rationale: protect recovery first
 * (deload, sleep), then regularity, then the plan around training, then the softer habit goals.
 */
export const SUGGESTION_KINDS = [
  'deload',
  'sleepEarlier',
  'wakeRegularity',
  'gymDay',
  'stepsGoal',
  'waterEarlier',
] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** A kind can read differently (steps up / down): the variant picks the texts. */
export type SuggestionVariant =
  | 'deload'
  | 'sleepEarlier'
  | 'wakeRegularity'
  | 'gymDay'
  | 'stepsRaise'
  | 'stepsLower'
  | 'waterEarlier';

export type SuggestionTextKey = `suggestions.${SuggestionVariant}.text`;
export type SuggestionReasonKey =
  | `suggestions.${SuggestionVariant}.reason`
  /** The water suggestion with the afternoon gap of the water curve in its reason. */
  | 'suggestions.waterEarlier.reasonGap';

/** The change the person accepts. Nothing is applied until "Aceptar". */
export type SuggestionChange =
  /** Planned bedtime moves earlier: `planShifts.bedMin` goes from `fromMin` to `toMin` (≤ 0). */
  | { type: 'bedtimeShift'; fromMin: number; toMin: number }
  /** Fix the wake time: `anchors.wake` becomes `to`. */
  | { type: 'wakeTime'; to: string }
  /** `goals.stepsGoal` goes from `from` to `to`. */
  | { type: 'stepsGoal'; from: number; to: number }
  /** Water reminders move earlier: `planShifts.waterMin` goes from `fromMin` to `toMin` (≤ 0). */
  | { type: 'waterShift'; fromMin: number; toMin: number }
  /** The gym session of weekday `fromDay` moves to weekday `toDay` (0 = Sunday). */
  | { type: 'moveGymDay'; fromDay: number; toDay: number }
  /** One lighter week: every working weight −`pct`%, from the day it is accepted. */
  | { type: 'deload'; pct: number; stepId: string };

export type SuggestionParams = Record<string, string | number>;
/** What `evidence.days` counts: calendar days or training sessions ("basado en N sesiones"). */
export type EvidenceUnit = 'days' | 'sessions';
/**
 * The numbers that back the suggestion. `days` is the count shown ("basado en N ..."); `unit`
 * says what it counts (rows stored before `unit` existed count days).
 */
export type SuggestionEvidence = { days: number; unit: EvidenceUnit } & Record<
  string,
  string | number
>;

export type Suggestion = {
  kind: SuggestionKind;
  variant: SuggestionVariant;
  change: SuggestionChange;
  textKey: SuggestionTextKey;
  /** The "por qué" shown with the suggestion. */
  reasonKey: SuggestionReasonKey;
  params: SuggestionParams;
  evidence: SuggestionEvidence;
};

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

/** What the engine knows about earlier suggestions (day keys, never timestamps). */
export type SuggestionHistoryEntry = {
  kind: SuggestionKind;
  /** What the change is about (weekday moved, exercise): rejections block per kind AND target. */
  target?: string | null;
  status: SuggestionStatus;
  /** `yyyy-MM-dd` it was created. */
  createdOn: string;
  /** `yyyy-MM-dd` it was accepted / rejected. */
  decidedOn: string | null;
};

export type LiftHistory = {
  stepId: string;
  name: string;
  /** Most recent FIRST (as `todayTarget` expects). */
  sessions: readonly ExerciseSession[];
};

/** One finished day of water: glasses logged by 18:00 against the goal of that day. */
export type WaterDay = { date: string; glassesAt18: number; targetGlasses: number };

export type SuggestionData = {
  anchors: Anchors;
  shifts: PlanShifts;
  gymDays: GymDays;
  /** Day the onboarding finished (the gym rule needs four full weeks after it). */
  startedOn?: string | undefined;
  /** Day the gym plan last changed (accepted suggestion or manual edit); judged only after it. */
  gymPlanChangedOn?: string | undefined;
  /** Day the steps goal last changed, however it changed. */
  goalsChangedOn?: string | undefined;
  /** Last day (`yyyy-MM-dd`) of the latest deload week, when there was one. */
  deloadEndedOn?: string | undefined;
  /** Morning check-ins of the last ~2 weeks. */
  sleep: readonly MorningCheckin[];
  steps: {
    history: readonly { date: string; steps: number }[];
    plan: StepsPlan;
    cap?: number | undefined;
  };
  /** Days that have at least one water log (days without any are "no data"). */
  water: readonly WaterDay[];
  /** Afternoon water gap from the water curve (PLAN §14b), when there is one: only adds a reason. */
  waterGap?: { fromHour: number; toHour: number } | undefined;
  /** Days (`yyyy-MM-dd`) the person trained: a finished session or a "Fui al gym" answer. */
  gymDates: readonly string[];
  lifts: readonly LiftHistory[];
  rules: TargetRules;
  /** A deload week is already running. */
  deloadActive: boolean;
  history: readonly SuggestionHistoryEntry[];
};
