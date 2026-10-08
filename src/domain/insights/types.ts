// Types of the insights engine (PLAN §12). Pure data: the engine returns i18n KEYS and numbers,
// never text.
import type { ActivityDay } from '../companion/rhythm';
import type { MorningCheckin } from '../formulas/sleep';
import type { SessionSets } from '../progress/strength';

/** Comparison kinds in PRIORITY order (the first one that qualifies and is not blocked wins). */
export const INSIGHT_KINDS = [
  'sleepGym',
  'energySleep',
  'gymSleepQuality',
  'stepsWeek',
  'bestWeekday',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

/** A kind reads differently depending on the direction of the difference. */
export type InsightVariant =
  | 'sleepGym.more'
  | 'sleepGym.less'
  | 'energySleep.higher'
  | 'energySleep.lower'
  | 'gymSleepQuality.better'
  | 'gymSleepQuality.worse'
  | 'stepsWeek.more'
  | 'stepsWeek.less'
  | 'bestWeekday.top';

export type InsightTextKey = `insights.${InsightVariant}`;
export type InsightParams = Record<string, string | number>;
/** `days` is the count shown ("basado en N días"); the rest are the numbers behind the finding. */
export type InsightEvidence = { days: number; unit: 'days'; value: number } & Record<
  string,
  string | number
>;

export type Insight = {
  kind: InsightKind;
  variant: InsightVariant;
  textKey: InsightTextKey;
  params: InsightParams;
  evidence: InsightEvidence;
};

/** What the engine knows about earlier insights (day keys, never timestamps). */
export type InsightHistoryEntry = {
  kind: InsightKind;
  /** `yyyy-MM-dd` it was created. */
  createdOn: string;
  /** The main number of that finding (`evidence.value`); unknown for rows without one. */
  value?: number | undefined;
};

export type InsightData = {
  /** Morning check-ins (bed and wake): the sleep that PRECEDES each date. */
  nights: readonly MorningCheckin[];
  /** Sleep quality (1-5) of the morning check-ins. */
  quality: readonly { date: string; value: number }[];
  /** Energy (1-5) of the evening check-ins. */
  energy: readonly { date: string; value: number }[];
  /** Days with ANY check-in. */
  checkinDates: readonly string[];
  /** Days (`yyyy-MM-dd`) the person trained: a finished session or a "Fui al gym" answer. */
  gymDates: readonly string[];
  /**
   * Days with POSITIVE evidence of no gym: an activity answer of another kind, or a day that is not
   * a planned gym day and has no finished session. Days without information are in neither list.
   */
  noGymDates: readonly string[];
  steps: readonly { date: string; steps: number }[];
  /** Days with movement information (gym / walk answers, sessions, steps). */
  activity: readonly ActivityDay[];
  /** Finished sessions with at least one set (more than the window: the previous one is needed). */
  sessions: readonly SessionSets[];
  history: readonly InsightHistoryEntry[];
  /** Free days, the "weekend" of workdays vs free days (0 = Sunday). Default Saturday and Sunday. */
  freeWeekdays?: readonly number[];
};
