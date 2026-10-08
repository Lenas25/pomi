// Repositories -> `ReportData`. Reads only; the builder decides what ends up in a report.
import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { waterTargetFor } from '../domain/habits/waterTarget';
import { stepsPlan } from '../domain/habits/stepsPlan';
import { toMorningCheckin } from '../domain/habits/checkins';
import { dayKeyFor } from '../domain/time';
import { pickProgram } from '../gym/program';
import { waterHabit } from '../suggestions/loadData';

import type { ReportData } from './types';

/** How far back data is read (the longest period is "all", capped here). */
export const REPORT_LOOKBACK_DAYS = 400;

export async function loadReportData(repos: Repositories, now: Date): Promise<ReportData> {
  const today = dayKeyFor(now);
  const from = format(subDays(parseISO(today), REPORT_LOOKBACK_DAYS), 'yyyy-MM-dd');

  const [modules, profile, startedOn, gymDays, goals, stepsEstimate, anchors] = await Promise.all([
    repos.templates.listModules(),
    repos.profile.get(),
    repos.settings.get('startedOn'),
    repos.settings.get('gymDays'),
    repos.settings.get('goals'),
    repos.settings.get('stepsEstimate'),
    repos.settings.get('anchors'),
  ]);
  const active = modules.filter((module) => module.active);
  const stepsFrom = startedOn !== undefined && startedOn < from ? startedOn : from;

  const [sessionRows, logs, steps, notes, morning, photos] = await Promise.all([
    repos.workouts.sessionsInRange(from, today),
    repos.habitLogs.inRange(from, today),
    repos.steps.inRange(stepsFrom, today),
    repos.foodNotes.inRange(from, today),
    repos.checkins.inRange(from, today, 'morning'),
    repos.photos.all(),
  ]);

  const exerciseNames: Record<string, string> = {};
  for (const routine of pickProgram(modules)?.routines ?? []) {
    for (const step of routine.steps) {
      if (step.type === 'sets') exerciseNames[step.id] = step.name;
    }
  }

  const water = waterHabit(active);
  const waterData: ReportData['water'] = water
    ? {
        glassMl: water.glassMl,
        days: logs
          .filter((log) => log.habitId === water.id)
          .map((log) => ({
            date: log.date,
            glasses: log.value,
            targetGlasses:
              waterTargetFor(log.date, {
                weightKg: profile?.weightKg ?? undefined,
                gymDays: gymDays ?? [],
                glassMl: water.glassMl,
                goals: goals ?? {},
              })?.glasses ?? null,
          })),
      }
    : null;

  const checks = active.flatMap((module) =>
    (module.template.habits ?? [])
      .filter((habit) => habit.type === 'check')
      .map((habit) => ({
        id: habit.id,
        name: habit.name,
        dates: logs
          .filter((log) => log.habitId === habit.id && log.value > 0)
          .map((log) => log.date),
      })),
  );

  const plan = stepsPlan({
    today,
    startedOn,
    history: steps,
    estimate: stepsEstimate,
    editedGoal: goals?.stepsGoal,
  });

  const morningQuestions = active.find((module) => module.template.checkins?.morning)?.template
    .checkins?.morning;

  return {
    today,
    startedOn,
    gymDays: gymDays ?? [],
    sessions: sessionRows
      .filter(({ session, sets }) => session.finishedAt !== null && sets.length > 0)
      .map(({ session, sets }) => ({
        date: session.date,
        sets: sets.map((set) => ({ stepId: set.stepId, weightKg: set.weightKg, reps: set.reps })),
      })),
    exerciseNames,
    water: waterData,
    steps,
    stepsGoal: plan.phase === 'active' ? plan.goal : null,
    checks,
    foodNotes: notes,
    sleep: morningQuestions
      ? morning.flatMap((row) => toMorningCheckin(row.date, morningQuestions, row.answers) ?? [])
      : [],
    sleepTargetH: anchors?.sleepTargetH,
    metrics: await Promise.all(
      active
        .flatMap((module) => module.template.metrics ?? [])
        .map(async (definition) => ({
          id: definition.id,
          name: definition.name,
          unit: definition.unit,
          entries: (await repos.metrics.inRange(definition.id, from, today)).map((row) => ({
            date: row.date,
            value: row.value,
          })),
        })),
    ),
    photos: photos.map((photo) => ({ date: photo.date, pose: photo.pose, name: photo.uri })),
  };
}
