// Reads what the companion engines need from the repositories (all local) and runs them.
import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { resolveAnchors } from '../domain/agenda/buildAgenda';
import {
  RHYTHM_WINDOW_DAYS,
  resolveFreeWeekdays,
  WATER_CURVE_WINDOW_DAYS,
  buildCompanion,
  type Companion,
  type CompanionData,
} from '../domain/companion';
import { toMorningCheckin } from '../domain/habits/checkins';
import { waterTargetFor } from '../domain/habits/waterTarget';
import { RATING_QUESTION_IDS } from '../review/loadReview';
import { waterHabit } from '../suggestions/loadData';

/** Energy (1-5) answered in an evening check-in, `undefined` when it is not a valid answer. */
function energyOf(answers: Readonly<Record<string, unknown>>): number | undefined {
  const value = answers[RATING_QUESTION_IDS.energy];
  return typeof value === 'number' && value >= 1 && value <= 5 ? value : undefined;
}

export async function loadCompanionData(
  repos: Repositories,
  today: string,
): Promise<CompanionData> {
  const key = (offset: number) => format(subDays(parseISO(today), offset), 'yyyy-MM-dd');
  const from = key(RHYTHM_WINDOW_DAYS - 1);

  const [modules, profile, anchors, shifts, gymDays, goals, freeDays, gymPlan, gymWeekPlans] =
    await Promise.all([
      repos.templates.listModules(),
      repos.profile.get(),
      repos.settings.get('anchors'),
      repos.settings.get('planShifts'),
      repos.settings.get('gymDays'),
      repos.settings.get('goals'),
      repos.settings.get('freeDays'),
      repos.settings.get('gymPlan'),
      repos.settings.get('gymWeekPlans'),
    ]);
  const active = modules.filter((module) => module.active);
  const morningQuestions = active.find((module) => module.template.checkins?.morning)?.template
    .checkins?.morning;

  const [morningRows, nightRows, activityRows, stepRows, sessions] = await Promise.all([
    morningQuestions ? repos.checkins.inRange(from, today, 'morning') : [],
    repos.checkins.inRange(from, today, 'night'),
    repos.activity.inRange(from, today),
    repos.steps.inRange(from, today),
    repos.workouts.sessionsInRange(from, today),
  ]);

  const nights = morningQuestions
    ? morningRows.flatMap((row) => toMorningCheckin(row.date, morningQuestions, row.answers) ?? [])
    : [];
  const energy = nightRows.flatMap((row) => {
    const value = energyOf(row.answers);
    return value === undefined ? [] : [{ date: row.date, value }];
  });

  // A day is "observed" when something says how it went; it "moved" with a gym session or a gym /
  // walk answer. A day without any of them is unknown, not a day without movement.
  const gymDates = new Set(
    sessions
      .filter((entry) => entry.session.finishedAt !== null && entry.sets.length > 0)
      .map((entry) => entry.session.date),
  );
  const moved = new Set(gymDates);
  const observed = new Set(gymDates);
  for (const row of activityRows) {
    observed.add(row.date);
    if (row.kind === 'gym' || row.kind === 'walk') moved.add(row.date);
  }
  const stepsByDate = new Map(
    stepRows.filter((row) => row.steps > 0).map((r) => [r.date, r.steps]),
  );
  for (const date of stepsByDate.keys()) observed.add(date);
  const activity = [...observed].map((date) => ({
    date,
    moved: moved.has(date),
    steps: stepsByDate.get(date),
  }));

  // Water: the writes of the last 14 days and the goal of each day.
  const habit = waterHabit(active);
  const events = habit
    ? (await repos.habitLogs.eventsInRange(key(WATER_CURVE_WINDOW_DAYS), key(1), habit.id)).map(
        (event) => ({ date: event.date, at: event.at, value: event.value }),
      )
    : [];
  const targets: Record<string, number> = {};
  if (habit) {
    for (const date of new Set(events.map((event) => event.date))) {
      const target = waterTargetFor(date, {
        weightKg: profile?.weightKg ?? undefined,
        gymDays: gymDays ?? [],
        gymPlan,
        gymWeekPlans,
        glassMl: habit.glassMl,
        goals: goals ?? {},
      });
      if (target) targets[date] = target.glasses;
    }
  }
  const resolved = resolveAnchors(anchors ?? {}, shifts ?? {});

  return {
    today,
    sleepTargetMin: anchors?.sleepTargetH ? anchors.sleepTargetH * 60 : undefined,
    nights,
    energy,
    checkinDates: [...morningRows, ...nightRows].map((row) => row.date),
    activity,
    water: { events, targets, wakeMin: resolved.wake, bedMin: resolved.bed },
    freeWeekdays: resolveFreeWeekdays(freeDays),
  };
}

export async function loadCompanion(repos: Repositories, today: string): Promise<Companion> {
  return buildCompanion(await loadCompanionData(repos, today));
}
