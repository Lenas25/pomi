import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { toMorningCheckin } from '../domain/habits/checkins';
import { sleepDurationMin, summarizeSleep, type SleepSummary } from '../domain/formulas/sleep';
import { RATING_QUESTION_IDS } from '../review/loadReview';

const LOOKBACK_DAYS = 7;

/** Sleep average / wake regularity from the last 7 days of morning check-ins (PLAN §9.3). */
export async function loadSleepSummary(
  repos: Repositories,
  today: string,
): Promise<SleepSummary | null> {
  const modules = (await repos.templates.listModules()).filter((module) => module.active);
  const questions = modules.find((module) => module.template.checkins?.morning)?.template.checkins
    ?.morning;
  if (!questions) return null;
  const from = format(subDays(parseISO(today), LOOKBACK_DAYS - 1), 'yyyy-MM-dd');
  const rows = await repos.checkins.inRange(from, today, 'morning');
  return summarizeSleep(
    rows.flatMap((row) => toMorningCheckin(row.date, questions, row.answers) ?? []),
  );
}

const HISTORY_NIGHTS = 14;

export type SleepNight = {
  date: string;
  bed: string;
  wake: string;
  durationMin: number;
  quality: number | null;
};

export type SleepDetail = {
  summary: SleepSummary | null;
  /** Morning check-ins of the last 14 days, newest first. */
  nights: SleepNight[];
};

/** The sleep detail page: last night, the 7-day summary and the check-in history. */
export async function loadSleepDetail(repos: Repositories, today: string): Promise<SleepDetail> {
  const modules = (await repos.templates.listModules()).filter((module) => module.active);
  const questions = modules.find((module) => module.template.checkins?.morning)?.template.checkins
    ?.morning;
  if (!questions) return { summary: null, nights: [] };
  const from = format(subDays(parseISO(today), HISTORY_NIGHTS - 1), 'yyyy-MM-dd');
  const rows = await repos.checkins.inRange(from, today, 'morning');
  const nights = rows
    .flatMap((row) => {
      const night = toMorningCheckin(row.date, questions, row.answers);
      if (!night) return [];
      const rating = row.answers[RATING_QUESTION_IDS.quality];
      return [
        {
          ...night,
          durationMin: sleepDurationMin(night.bed, night.wake),
          quality: typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : null,
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const weekFrom = format(subDays(parseISO(today), LOOKBACK_DAYS - 1), 'yyyy-MM-dd');
  return { summary: summarizeSleep(nights.filter((night) => night.date >= weekFrom)), nights };
}
