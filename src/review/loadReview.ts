// Everything the weekly review screen needs, read in one pass (all local, near instant).
import { expiryCutoff } from '../domain/suggestions/limits';
import { addDays, format, parseISO } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { toMorningCheckin } from '../domain/habits/checkins';
import { stepsPlan } from '../domain/habits/stepsPlan';
import { waterTargetFor } from '../domain/habits/waterTarget';
import {
  buildWeeklyReview,
  reviewWeekStart,
  type DayRating,
  type WeeklyReview,
  type WeeklyReviewData,
} from '../domain/review/buildWeeklyReview';
import { dayKeyFor } from '../domain/time';
import { loadHabitsData } from '../habits/habitsData';
import { insightsBetweenDays, parseInsightRow, type StoredInsight } from '../insights/payload';
import { parsePayload, type SuggestionPayload } from '../suggestions/payload';
import { toHistory, waterHabit } from '../suggestions/loadData';
import { isKindAvailable } from '../domain/suggestions/buildSuggestions';

import { loadWeekPlanStep, type WeekPlanStep } from './weekPlan';

/**
 * Question ids of `templates/metricas.json` that carry the 1-5 scales. A template without one of
 * them simply has no line for it.
 */
export const RATING_QUESTION_IDS = {
  quality: 'calidad-sueno',
  energy: 'energia',
  mood: 'animo',
} as const;

export type ReviewScreenData = {
  review: WeeklyReview;
  /** Pending suggestions, oldest first. */
  suggestions: { id: number; payload: SuggestionPayload }[];
  /** The insight found during the reviewed week, if any (PLAN §12: at most one per week). */
  insight?: StoredInsight | undefined;
  /** "Planifica tu semana": the week to plan, prefilled from the usual plan. */
  weekPlan: WeekPlanStep;
};

function ratingsOf(
  rows: readonly { date: string; answers: Record<string, unknown> }[],
  id: string,
): DayRating[] {
  return rows.flatMap((row) => {
    const value = row.answers[id];
    return typeof value === 'number' && Number.isFinite(value) ? [{ date: row.date, value }] : [];
  });
}

export async function loadReview(repos: Repositories, now: Date): Promise<ReviewScreenData> {
  const today = dayKeyFor(now);
  const weekStart = reviewWeekStart(today);
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

  const habits = await loadHabitsData(repos, today);
  const [sessions, activity, checkins, pending] = await Promise.all([
    repos.workouts.sessionsInRange(weekStart, weekEnd),
    repos.activity.inRange(weekStart, weekEnd),
    repos.checkins.inRange(weekStart, weekEnd),
    repos.suggestions.pending(expiryCutoff(now)),
  ]);
  const history = toHistory(await repos.suggestions.all());

  const active = habits.modules.filter((module) => module.active);
  const gymDates = [
    ...new Set([
      ...sessions
        .filter((entry) => entry.session.finishedAt !== null && entry.sets.length > 0)
        .map((entry) => entry.session.date),
      ...activity.filter((row) => row.kind === 'gym').map((row) => row.date),
    ]),
  ];

  const habit = waterHabit(active);
  const water: WeeklyReviewData['water'] = habit
    ? habits.habitLogs
        .filter((log) => log.habitId === habit.id && log.date >= weekStart && log.date <= weekEnd)
        .map((log) => ({
          date: log.date,
          glasses: log.value,
          targetGlasses:
            waterTargetFor(log.date, {
              weightKg: habits.profile.weightKg,
              gymDays: habits.gymDays,
              gymPlan: habits.gymPlan,
              gymWeekPlans: habits.gymWeekPlans,
              glassMl: habit.glassMl,
              goals: habits.goals,
            })?.glasses ?? null,
        }))
    : [];

  const plan = stepsPlan({
    today,
    startedOn: habits.startedOn,
    history: habits.steps,
    estimate: habits.stepsEstimate,
    editedGoal: habits.goals.stepsGoal,
  });

  const morningQuestions = active.find((module) => module.template.checkins?.morning)?.template
    .checkins?.morning;
  const morning = checkins.filter((row) => row.kind === 'morning');
  const night = checkins.filter((row) => row.kind === 'night');
  const anchors = (await repos.settings.get('anchors')) ?? {};
  const goalsChangedOn = await repos.settings.get('goalsChangedOn');
  const gymWeekPlans = await repos.settings.get('gymWeekPlans');

  const data: WeeklyReviewData = {
    gymDays: habits.gymDays,
    ...(gymWeekPlans ? { gymWeekPlans } : {}),
    anchors,
    gymDates,
    sleepEarlierAvailable: isKindAvailable('sleepEarlier', history, today),
    water,
    steps: habits.steps,
    // While the baseline week is measuring there is no goal to compare against. Only the CURRENT
    // steps goal is stored: when it changed during the reviewed week the days are not comparable
    // (part of them had the old goal), so the week reports an average instead of "days met".
    // Water is per day already: `waterTargetFor(date)` gives each day its own target (the accepted
    // glasses in `goals` are the current ones, a documented limit).
    stepsGoal:
      plan.phase === 'active' && !(goalsChangedOn !== undefined && goalsChangedOn > weekStart)
        ? plan.goal
        : null,
    sleep: morningQuestions
      ? morning.flatMap((row) => toMorningCheckin(row.date, morningQuestions, row.answers) ?? [])
      : [],
    ratings: {
      quality: ratingsOf(morning, RATING_QUESTION_IDS.quality),
      energy: ratingsOf(night, RATING_QUESTION_IDS.energy),
      mood: ratingsOf(night, RATING_QUESTION_IDS.mood),
    },
  };

  const insight = await repos.insights
    .all()
    .then(
      (rows) =>
        insightsBetweenDays(
          rows.flatMap((row) => parseInsightRow(row) ?? []),
          weekStart,
          weekEnd,
        )[0],
    )
    .catch(() => undefined);

  return {
    review: buildWeeklyReview(data, weekStart, today),
    insight,
    weekPlan: await loadWeekPlanStep(repos, today),
    suggestions: pending.flatMap((row) => {
      const payload = parsePayload(row.payload);
      return payload ? [{ id: row.id, payload }] : [];
    }),
  };
}
