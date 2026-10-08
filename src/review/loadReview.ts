// Everything the weekly review screen needs, read in one pass (all local, near instant).
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
import { parsePayload, type SuggestionPayload } from '../suggestions/payload';
import { waterHabit } from '../suggestions/loadData';

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
    repos.suggestions.pending(),
  ]);

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

  const data: WeeklyReviewData = {
    gymDays: habits.gymDays,
    anchors,
    gymDates,
    water,
    steps: habits.steps,
    // While the baseline week is measuring there is no goal to compare against.
    stepsGoal: plan.phase === 'active' ? plan.goal : null,
    sleep: morningQuestions
      ? morning.flatMap((row) => toMorningCheckin(row.date, morningQuestions, row.answers) ?? [])
      : [],
    ratings: {
      quality: ratingsOf(morning, RATING_QUESTION_IDS.quality),
      energy: ratingsOf(night, RATING_QUESTION_IDS.energy),
      mood: ratingsOf(night, RATING_QUESTION_IDS.mood),
    },
  };

  return {
    review: buildWeeklyReview(data, weekStart),
    suggestions: pending.flatMap((row) => {
      const payload = parsePayload(row.payload);
      return payload ? [{ id: row.id, payload }] : [];
    }),
  };
}
