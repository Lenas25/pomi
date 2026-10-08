// Reads everything `buildInsights` needs from the repositories (all local, near instant).
import { format, getDay, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import type { InsightRow } from '../db/repositories/insights';
import { resolveFreeWeekdays } from '../domain/companion/limits';
import { toMorningCheckin } from '../domain/habits/checkins';
import {
  INSIGHTS_WINDOW_DAYS,
  INSIGHT_KINDS,
  type InsightData,
  type InsightHistoryEntry,
} from '../domain/insights';
import { dayKeyFor } from '../domain/time';
import { RATING_QUESTION_IDS } from '../review/loadReview';

import { parseInsightRow } from './payload';

/** Sessions go further back than the window: the first one inside it needs its predecessor. */
const SESSIONS_EXTRA_DAYS = 90;

/** Rows -> the engine's history (day keys). Unreadable rows still count by kind when known. */
export function toInsightHistory(rows: readonly InsightRow[]): InsightHistoryEntry[] {
  return rows.flatMap((row) => {
    const parsed = parseInsightRow(row);
    if (parsed) {
      return [
        { kind: parsed.kind, createdOn: dayKeyFor(new Date(row.createdAt)), value: parsed.value },
      ];
    }
    const kind = INSIGHT_KINDS.find((candidate) => candidate === row.kind);
    return kind ? [{ kind, createdOn: dayKeyFor(new Date(row.createdAt)) }] : [];
  });
}

function rating(
  rows: readonly { date: string; answers: Readonly<Record<string, unknown>> }[],
  id: string,
): { date: string; value: number }[] {
  return rows.flatMap((row) => {
    const value = row.answers[id];
    return typeof value === 'number' && value >= 1 && value <= 5 ? [{ date: row.date, value }] : [];
  });
}

export async function loadInsightData(repos: Repositories, today: string): Promise<InsightData> {
  const key = (offset: number) => format(subDays(parseISO(today), offset), 'yyyy-MM-dd');
  const from = key(INSIGHTS_WINDOW_DAYS - 1);
  const sessionsFrom = key(INSIGHTS_WINDOW_DAYS - 1 + SESSIONS_EXTRA_DAYS);

  const [modules, past, plannedGym, freeDays] = await Promise.all([
    repos.templates.listModules(),
    repos.insights.all(),
    repos.settings.get('gymDays'),
    repos.settings.get('freeDays'),
  ]);
  const plannedWeekdays = new Set((plannedGym ?? []).flatMap((entry) => entry.days));
  const morningQuestions = modules
    .filter((module) => module.active)
    .find((module) => module.template.checkins?.morning)?.template.checkins?.morning;

  const [morningRows, nightRows, activityRows, stepRows, sessions] = await Promise.all([
    morningQuestions ? repos.checkins.inRange(from, today, 'morning') : [],
    repos.checkins.inRange(from, today, 'night'),
    repos.activity.inRange(from, today),
    repos.steps.inRange(from, today),
    repos.workouts.sessionsInRange(sessionsFrom, today),
  ]);

  const finished = sessions.filter(
    (entry) => entry.session.finishedAt !== null && entry.sets.length > 0,
  );
  const gymSessionDates = new Set(
    finished.filter((e) => e.session.date >= from).map((entry) => entry.session.date),
  );
  const gymDates = new Set(gymSessionDates);
  const moved = new Set(gymSessionDates);
  const observed = new Set(gymSessionDates);
  for (const row of activityRows) {
    observed.add(row.date);
    if (row.kind === 'gym') gymDates.add(row.date);
    if (row.kind === 'gym' || row.kind === 'walk') moved.add(row.date);
  }
  // POSITIVE evidence of no gym only: an explicit answer of another kind, or (when a gym plan
  // exists) a planned-off weekday with no session. With no plan only explicit answers count.
  // Today is excluded: the day is not over, a session may still happen.
  const noGym = new Set<string>();
  const answered = new Set(activityRows.map((row) => row.date));
  for (const row of activityRows) if (row.kind !== 'gym' && row.date < today) noGym.add(row.date);
  if (plannedWeekdays.size > 0) {
    for (let offset = INSIGHTS_WINDOW_DAYS - 1; offset >= 1; offset -= 1) {
      const date = key(offset);
      if (!answered.has(date) && !plannedWeekdays.has(getDay(parseISO(date)))) noGym.add(date);
    }
  }
  for (const date of gymDates) noGym.delete(date);
  const stepsByDate = new Map(stepRows.filter((r) => r.steps > 0).map((r) => [r.date, r.steps]));
  for (const date of stepsByDate.keys()) observed.add(date);

  return {
    nights: morningQuestions
      ? morningRows.flatMap(
          (row) => toMorningCheckin(row.date, morningQuestions, row.answers) ?? [],
        )
      : [],
    quality: rating(morningRows, RATING_QUESTION_IDS.quality),
    energy: rating(nightRows, RATING_QUESTION_IDS.energy),
    checkinDates: [...morningRows, ...nightRows].map((row) => row.date),
    gymDates: [...gymDates],
    noGymDates: [...noGym],
    freeWeekdays: resolveFreeWeekdays(freeDays),
    steps: stepRows,
    activity: [...observed].map((date) => ({
      date,
      moved: moved.has(date),
      steps: stepsByDate.get(date),
    })),
    sessions: finished.map(({ session, sets }) => ({ date: session.date, sets })),
    history: toInsightHistory(past),
  };
}
