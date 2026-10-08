// Types of the evidence-based routine generator (PLAN §14c). Pure data: the generator returns a
// program in the template format plus metadata; every sentence a person reads is composed from
// i18n keys by the caller (`TextResolver`), never written here.
import type { ModuleTemplate } from '../../templates/schema';

export type Program = NonNullable<ModuleTemplate['programs']>[number];

export const GOALS = ['hypertrophy', 'strength', 'fatLoss', 'health'] as const;
export type Goal = (typeof GOALS)[number];

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];

export const EQUIPMENT = ['gym', 'dumbbells', 'bodyweight'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const LIMITATIONS = ['knee', 'lower_back', 'shoulder', 'wrist'] as const;
export type Limitation = (typeof LIMITATIONS)[number];

/** Region that gets extra volume for a hypertrophy goal ("hipertrofia de una zona"). */
export const REGIONS = ['glutes', 'legs', 'back', 'chest', 'shoulders', 'arms'] as const;
export type Region = (typeof REGIONS)[number];

/** Same vocabulary as `templates/gym.json` (extended with pecho, hombro and gemelos). */
export const MUSCLES = [
  'gluteo',
  'cuadriceps',
  'isquios',
  'pecho',
  'espalda',
  'hombro',
  'gemelos',
  'biceps',
  'triceps',
  'hombro_posterior',
  'gluteo_medio',
  'espalda_alta',
  'core',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const PATTERNS = [
  'squat',
  'hip_hinge',
  'lunge',
  'hip_thrust',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'knee_flexion',
  'knee_extension',
  'chest_fly',
  'lateral_raise',
  'rear_delt',
  'glute_iso',
  'glute_med',
  'biceps',
  'triceps',
  'calves',
  'core_anti_extension',
  'core_anti_rotation',
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Ids of the sections of docs/evidence/training.md (`E<n>` = section `<n>`). */
export const EVIDENCE_IDS = [
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'E6',
  'E7',
  'E8',
  'E9',
  'E10',
  'E11',
  'E12',
  'E13',
] as const;
export type EvidenceId = (typeof EVIDENCE_IDS)[number];

export type EvidenceRef = { id: EvidenceId; source: string };

/** Answers to the 7 PAR-Q+ general health questions (`true` = yes) and the acknowledgement. */
export type Screening = { answers: readonly boolean[]; acknowledged: boolean };

export type GeneratorInput = {
  goal: Goal;
  /** Priority region (hypertrophy only). */
  focusRegion?: Region | undefined;
  level: Level;
  /** 2-6; reduced when the goal and level do not support that many (`summary.warnings`). */
  daysPerWeek: number;
  /** 30-90 minutes per session, warm-up and cardio included. */
  sessionMin: number;
  equipment: Equipment;
  limitations: readonly Limitation[];
  screening: Screening;
  /** Any string: only breaks ties between equally good exercises, so the output is deterministic. */
  seed?: string | undefined;
};

/** What the generator really used after the limits and the screening were applied. */
export type EffectiveInput = {
  goal: Goal;
  focusRegion: Region | undefined;
  level: Level;
  daysPerWeek: number;
  sessionMin: number;
  equipment: Equipment;
  limitations: readonly Limitation[];
  seed: string;
  /**
   * A PAR-Q+ "yes" (not a referral question) was acknowledged: a gentle beginner routine with
   * machines and body weight only, 3-4 RIR, no loaded hinge, no ramp-up sets.
   */
  restricted: boolean;
};

export const SESSION_KINDS = ['full', 'upper', 'lower', 'push', 'pull', 'legs'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export type PlanEntry = { exerciseId: string; sets: number };
export type PlanSession = {
  id: string;
  kind: SessionKind;
  /** "A", "B"... among the sessions of the same kind. */
  letter: string;
  entries: PlanEntry[];
  /** Minutes of easy cardio added at the end. */
  cardioMin: number;
  /** The cardio is a suggestion on top of the lifting (hypertrophy and strength), not the plan. */
  cardioOptional: boolean;
};
export type Plan = { sessions: PlanSession[] };

export type RuleId =
  | 'volume'
  | 'priority'
  | 'frequency'
  | 'split'
  | 'loadReps'
  | 'effort'
  | 'rest'
  | 'progression'
  | 'warmup'
  | 'exerciseOrder'
  | 'time'
  | 'limitations'
  | 'cardio'
  | 'cardioOptional'
  | 'screening';

export type RuleRef = {
  id: RuleId;
  evidence: EvidenceId[];
  /** A documented engineering default ([DESIGN] in the evidence file), not a finding. */
  design: boolean;
  /** Numbers the "por qué" text uses. */
  params: Record<string, string | number>;
};

export type MuscleVolume = {
  muscle: Muscle;
  /** Direct-equivalent hard sets per week (an indirect set counts 0.5). */
  sets: number;
  min: number;
  max: number;
  target: number;
  priority: boolean;
  status: 'ok' | 'low' | 'high';
  /** Sessions of the week that train it (a primary or secondary mover with at least one set). */
  frequency: number;
};

export type SessionSummary = {
  id: string;
  kind: SessionKind;
  /** Estimated minutes: warm-up + sets with their rest + cardio. */
  minutes: number;
  sets: number;
  exercises: number;
};

export type WarningCode =
  'daysReduced' | 'volumeBelowRange' | 'cardioBelowWho' | 'restrictedTemplate' | 'noSafeExercise';

export type GeneratorWarning = { code: WarningCode; params: Record<string, string | number> };

export type PlanSummary = {
  daysRequested: number;
  daysUsed: number;
  sessions: SessionSummary[];
  weekly: MuscleVolume[];
  who: {
    aerobicMin: number;
    aerobicTargetMin: number;
    strengthDays: number;
    strengthTargetDays: number;
  };
  warnings: GeneratorWarning[];
  rules: RuleRef[];
};

export type GeneratedProgram = {
  input: EffectiveInput;
  plan: Plan;
  program: Program;
  /** Metadata for audit and for the preview; never shown as program text. */
  evidence: EvidenceRef[];
  summary: PlanSummary;
};

export type GenerationFailure =
  | 'screeningRequired'
  | 'acknowledgementRequired'
  /** PAR-Q+ question 2 or 7 answered "yes": no routine is generated, the person is referred. */
  | 'referralRequired'
  | 'noExercises';

export type GenerationResult =
  { ok: true; value: GeneratedProgram } | { ok: false; reason: GenerationFailure };

/** Composes a text from an i18n key (the caller binds it to `t`). */
export type TextResolver = (key: string, params?: Record<string, string | number>) => string;
