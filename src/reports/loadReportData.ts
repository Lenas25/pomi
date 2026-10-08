// Repositories -> `ReportData`. Reads only; the builder decides what ends up in a report.
import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { waterTargetFor } from '../domain/habits/waterTarget';
import { stepsPlan } from '../domain/habits/stepsPlan';
import { toMorningCheckin } from '../domain/habits/checkins';
import { dayKeyFor } from '../domain/time';
import { exerciseIdOfStep } from '../domain/generator/program';
import { t } from '../i18n';
import { parseInsightRow } from '../insights/payload';
import { loadExerciseLibrary } from '../templates/exercises';
import { waterHabit } from '../suggestions/loadData';

import { REPORT_LOOKBACK_DAYS } from './period';
import type { ReportData } from './types';

export { REPORT_LOOKBACK_DAYS };

/**
 * Names of the exercises that may appear in a report. Sessions of ANY past program have sets, so
 * every stored module counts (active or not), not just the program being trained. Ids the stored
 * programs no longer have (e.g. a generated `rdl@db~s`) fall back to the library name of their
 * base exercise in the current language.
 */
export function exerciseNamesFor(
  modules: readonly {
    template: {
      programs?: readonly {
        routines: readonly { steps: readonly { type: string; id: string; name?: string }[] }[];
      }[];
    };
  }[],
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const module of modules) {
    for (const program of module.template.programs ?? []) {
      for (const routine of program.routines) {
        for (const step of routine.steps) {
          if (step.type === 'sets' && step.name !== undefined && names[step.id] === undefined) {
            names[step.id] = step.name;
          }
        }
      }
    }
  }
  return names;
}

function libraryName(stepId: string): string | undefined {
  const exercise = loadExerciseLibrary().find((item) => item.id === exerciseIdOfStep(stepId));
  return exercise ? t(exercise.nameKey as never) : undefined;
}

export async function loadReportData(repos: Repositories, now: Date): Promise<ReportData> {
  const today = dayKeyFor(now);
  const from = format(subDays(parseISO(today), REPORT_LOOKBACK_DAYS), 'yyyy-MM-dd');

  const [
    modules,
    profile,
    startedOn,
    gymDays,
    goals,
    stepsEstimate,
    anchors,
    gymPlan,
    gymWeekPlans,
  ] = await Promise.all([
    repos.templates.listModules(),
    repos.profile.get(),
    repos.settings.get('startedOn'),
    repos.settings.get('gymDays'),
    repos.settings.get('goals'),
    repos.settings.get('stepsEstimate'),
    repos.settings.get('anchors'),
    repos.settings.get('gymPlan'),
    repos.settings.get('gymWeekPlans'),
  ]);
  const active = modules.filter((module) => module.active);
  const stepsFrom = startedOn !== undefined && startedOn < from ? startedOn : from;

  const [sessionRows, logs, steps, notes, morning, photos, insightRows] = await Promise.all([
    repos.workouts.sessionsInRange(from, today),
    repos.habitLogs.inRange(from, today),
    repos.steps.inRange(stepsFrom, today),
    repos.foodNotes.inRange(from, today),
    repos.checkins.inRange(from, today, 'morning'),
    repos.photos.all(),
    repos.insights.all(),
  ]);
  const findings = insightRows.flatMap((row) => parseInsightRow(row) ?? []);

  const exerciseNames = exerciseNamesFor(modules);
  for (const { sets } of sessionRows) {
    for (const set of sets) {
      const name = exerciseNames[set.stepId] ?? libraryName(set.stepId);
      if (name !== undefined) exerciseNames[set.stepId] = name;
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
                gymPlan,
                gymWeekPlans,
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
    ...(gymPlan ? { gymPlan } : {}),
    ...(gymWeekPlans ? { gymWeekPlans } : {}),
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
    findings,
    photos: photos.map((photo) => ({ date: photo.date, pose: photo.pose, name: photo.uri })),
  };
}
