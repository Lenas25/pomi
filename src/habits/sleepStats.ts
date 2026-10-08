import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { toMorningCheckin } from '../domain/habits/checkins';
import { summarizeSleep, type SleepSummary } from '../domain/formulas/sleep';

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
