// All the companion engines in one pure call, plus the choice of the single card Hoy may show.
import type { MorningCheckin } from '../formulas/sleep';

import { SLEEP_DEBT_CARD_MIN } from './limits';
import { buildRhythm, type ActivityDay, type Rhythm } from './rhythm';
import { sleepDebt, type SleepDebt } from './sleepDebt';
import { socialJetlag, type SocialJetlag } from './socialJetlag';
import { waterCurve, type WaterCurve, type WaterEventRow } from './waterCurve';

export type CompanionData = {
  today: string;
  /** Sleep goal in minutes (onboarding), when known. */
  sleepTargetMin?: number | undefined;
  nights: readonly MorningCheckin[];
  energy: readonly { date: string; value: number }[];
  checkinDates: readonly string[];
  activity: readonly ActivityDay[];
  water: {
    events: readonly WaterEventRow[];
    targets: Readonly<Record<string, number>>;
    wakeMin?: number | undefined;
    bedMin?: number | undefined;
  };
  freeWeekdays?: readonly number[];
};

export type Companion = {
  sleepDebt: SleepDebt | null;
  jetlag: SocialJetlag | null;
  water: WaterCurve | null;
  rhythm: Rhythm;
};

export function buildCompanion(data: CompanionData): Companion {
  const { today } = data;
  return {
    sleepDebt: sleepDebt(data.nights, data.sleepTargetMin, today),
    jetlag: socialJetlag(data.nights, today, data.freeWeekdays),
    water: waterCurve({ ...data.water, today }),
    rhythm: buildRhythm({
      today,
      nights: data.nights,
      energy: data.energy,
      activity: data.activity,
      checkinDates: data.checkinDates,
      ...(data.freeWeekdays ? { freeWeekdays: data.freeWeekdays } : {}),
    }),
  };
}

export type TodayCard =
  | { kind: 'sleepDebt'; debtMin: number }
  | { kind: 'jetlag'; jetlagMin: number }
  | { kind: 'waterGap'; fromHour: number; toHour: number };

/**
 * The ONE companion card Hoy may show (HANDOFF §8: never more than one insight card), or `null`.
 * Priority: a noticeable sleep debt, then a noticeable social jetlag, then an afternoon water gap.
 * Quiet by default: below the thresholds nothing is shown on Hoy (Progreso still has the numbers).
 */
export function pickTodayCard(companion: Companion): TodayCard | null {
  if (companion.sleepDebt && companion.sleepDebt.debtMin >= SLEEP_DEBT_CARD_MIN) {
    return { kind: 'sleepDebt', debtMin: companion.sleepDebt.debtMin };
  }
  if (companion.jetlag?.notable) return { kind: 'jetlag', jetlagMin: companion.jetlag.jetlagMin };
  const gap = companion.water?.gap;
  return gap ? { kind: 'waterGap', fromHour: gap.fromHour, toHour: gap.toHour } : null;
}
