// Types of the "Compartir progreso" reports (PLAN §14). A report is a typed MODEL built from the
// person's data and a selection; renderers (text, HTML for the PDF, later CSV / JSON) only turn the
// model into a string. Nothing outside the selection ever reaches the model.
import type { GymDays } from '../templates/schema';
import type { MorningCheckin } from '../domain/formulas/sleep';
import type { SessionSets } from '../domain/progress/strength';
import type { MetricPoint } from '../domain/progress/metrics';

/** What can be shared, in the order it is written. `findings` arrives with the v3 engine. */
export const REPORT_SECTIONS = [
  'gym',
  'habits',
  'sleep',
  'measures',
  'photos',
  'findings',
] as const;
export type ReportSectionId = (typeof REPORT_SECTIONS)[number];

/** Sections the person can pick today (the findings engine does not exist yet). */
export const AVAILABLE_SECTIONS: readonly ReportSectionId[] = [
  'gym',
  'habits',
  'sleep',
  'measures',
  'photos',
];

export const REPORT_TEMPLATES = ['trainer', 'nutritionist', 'ai', 'custom'] as const;
export type ReportTemplateId = (typeof REPORT_TEMPLATES)[number];

export const REPORT_PERIODS = ['7d', '30d', '90d', 'all'] as const;
export type ReportPeriodKind = (typeof REPORT_PERIODS)[number];

/** `text` and `pdf` exist today; `csv` and `json` are v3 (see `renderers.ts`). */
export type ReportFormat = 'text' | 'pdf';

export const MAX_NOTE_LENGTH = 500;
/**
 * Photos embedded in the PDF (newest first; the text model keeps all of them). Each is downscaled
 * first (`shareReport.ts`) and a byte cap applies on top (see `photoBudget.ts`).
 */
export const MAX_REPORT_PHOTOS = 2;

export type ReportSelection = {
  template: ReportTemplateId;
  sections: readonly ReportSectionId[];
  period: ReportPeriodKind;
  /** Optional intro written by the person; included verbatim. */
  note: string;
  /** Food notes are personal text: a separate switch inside the habits section. */
  foodNotes: boolean;
};

export type ReportPeriod = { kind: ReportPeriodKind; from: string; to: string };

// --- What the builder reads (rows already read from the database) -------------------------------

export type ReportMetricData = {
  id: string;
  name: string;
  unit: string;
  entries: readonly MetricPoint[];
};

export type ReportData = {
  /** Logical day (`dayKeyFor`) the report is made on. */
  today: string;
  startedOn?: string | undefined;
  gymDays: GymDays;
  /** Finished sessions that have at least one set. */
  sessions: readonly SessionSets[];
  exerciseNames: Readonly<Record<string, string>>;
  water: {
    glassMl: number | undefined;
    days: readonly { date: string; glasses: number; targetGlasses: number | null }[];
  } | null;
  steps: readonly { date: string; steps: number }[];
  /** Current steps goal; `null` while the baseline week is measuring. */
  stepsGoal: number | null;
  checks: readonly { id: string; name: string; dates: readonly string[] }[];
  foodNotes: readonly { date: string; text: string }[];
  sleep: readonly MorningCheckin[];
  sleepTargetH: number | undefined;
  metrics: readonly ReportMetricData[];
  photos: readonly { date: string; pose: string; name: string }[];
};

// --- The model ----------------------------------------------------------------------------------

export type GymExerciseReport = {
  stepId: string;
  name: string;
  /** Days with at least one set of this exercise in the period. */
  sessions: number;
  sets: number;
  firstDate: string;
  lastDate: string;
  /** Estimated 1RM (Epley) of the best set of the first / last day with a usable set. */
  e1rmFrom: number | null;
  e1rmTo: number | null;
  /** Heaviest weight and the best reps of the period (bodyweight: no weight). */
  topWeightKg: number | null;
  bestReps: number | null;
};

export type GymReport = {
  kind: 'gym';
  empty: boolean;
  sessionsDone: number;
  /** Planned gym days that fall inside the period (from the start of use), 0 when none planned. */
  sessionsPlanned: number;
  exercises: GymExerciseReport[];
};

export type HabitsReport = {
  kind: 'habits';
  empty: boolean;
  water: { daysLogged: number; daysMet: number; averageGlasses: number; glassMl?: number } | null;
  steps: {
    daysLogged: number;
    average: number;
    goal: number | null;
    daysMet: number | null;
  } | null;
  checks: { name: string; days: number }[];
  /** `null` unless the person switched food notes on. */
  foodNotes: { date: string; text: string }[] | null;
};

export type SleepReport = {
  kind: 'sleep';
  empty: boolean;
  nights: number;
  averageMin: number;
  targetMin: number | null;
  /** Spread of the wake times (circular range, minutes); `null` below two nights. */
  wakeRangeMin: number | null;
};

export type MeasuresReport = {
  kind: 'measures';
  empty: boolean;
  metrics: {
    name: string;
    unit: string;
    entries: MetricPoint[];
    change: number | null;
  }[];
};

export type PhotosReport = {
  kind: 'photos';
  empty: boolean;
  /** Newest first, all in the period (the PDF path keeps `MAX_REPORT_PHOTOS`). `name` is the file name in the private folder. */
  items: { date: string; pose: string; name: string }[];
  /** Photos in the period. */
  total: number;
};

export type ReportSection = GymReport | HabitsReport | SleepReport | MeasuresReport | PhotosReport;

export type ReportModel = {
  template: ReportTemplateId;
  period: ReportPeriod;
  note: string;
  /** The AI template adds the instruction line. */
  instruction: boolean;
  sections: ReportSection[];
};

// --- Renderers ----------------------------------------------------------------------------------

/**
 * A renderer turns the model into a string for one format. CSV and JSON (v3) will be two more
 * entries of this shape; the rest of the pipeline (model, selection, preview) does not change.
 */
export type ReportRenderer<Context> = (model: ReportModel, context: Context) => string;
