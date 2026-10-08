// Repositories -> `ProgressData`. The numbers are computed by the pure functions in
// `src/domain/progress` and `progressView.ts`; this file only reads.
import { format, parseISO, startOfMonth, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import type { PhotoRow } from '../db/repositories/photos';
import type { MetricFrequency, MetricPoint } from '../domain/progress/metrics';
import type { SessionSets } from '../domain/progress/strength';
import { DEFAULT_WEEKS } from '../domain/progress/weekly';
import { pickProgram } from '../gym/program';
import type { GymDays } from '../templates/schema';

/** How far back the strength history reaches (26 weeks). */
export const STRENGTH_LOOKBACK_DAYS = 182;
/** How far back measurements are read for the charts. */
export const METRIC_LOOKBACK_DAYS = 400;

export type ProgressMetric = {
  id: string;
  name: string;
  unit: string;
  frequency: MetricFrequency;
  entries: MetricPoint[];
};

export type ProgressData = {
  today: string;
  startedOn?: string | undefined;
  gymDays: GymDays;
  /** Finished sessions that have at least one set. */
  sessions: SessionSets[];
  /** Days (any age inside the weekly window) with a habit value logged. */
  habitDates: string[];
  /** Exercise names by step id, from the active program. */
  exerciseNames: Record<string, string>;
  metrics: ProgressMetric[];
  /** Photo rows, newest first (the files live in private storage, see `src/photos`). */
  photos: PhotoRow[];
  /** Poses of the monthly review, from the metrics template (e.g. frente, perfil, espalda). */
  poses: string[];
  /** The template's short guide for taking the photos. */
  photoGuide?: string | undefined;
  /** A monthly review already exists for the current month. */
  monthlyDone: boolean;
};

const key = (date: Date) => format(date, 'yyyy-MM-dd');

export async function loadProgressData(repos: Repositories, today: string): Promise<ProgressData> {
  const now = parseISO(today);
  const sessionsFrom = key(subDays(now, STRENGTH_LOOKBACK_DAYS));
  const habitsFrom = key(subDays(now, DEFAULT_WEEKS * 7));
  const metricsFrom = key(subDays(now, METRIC_LOOKBACK_DAYS));

  const monthStart = key(startOfMonth(now));
  const [modules, startedOn, gymDays, sessionRows, habitRows, photos, monthly] = await Promise.all([
    repos.templates.listModules(),
    repos.settings.get('startedOn'),
    repos.settings.get('gymDays'),
    repos.workouts.sessionsInRange(sessionsFrom, today),
    repos.habitLogs.inRange(habitsFrom, today),
    repos.photos.all(),
    repos.checkins.inRange(monthStart, today, 'monthly'),
  ]);

  const exerciseNames: Record<string, string> = {};
  for (const routine of pickProgram(modules)?.routines ?? []) {
    for (const step of routine.steps) {
      if (step.type === 'sets') exerciseNames[step.id] = step.name;
    }
  }

  const definitions = modules
    .filter((module) => module.active)
    .flatMap((module) => module.template.metrics ?? []);
  const photoSpec = modules
    .filter((module) => module.active)
    .map((module) => module.template.photos)
    .find((spec) => spec !== undefined);
  const metrics = await Promise.all(
    definitions.map(async (definition): Promise<ProgressMetric> => ({
      id: definition.id,
      name: definition.name,
      unit: definition.unit,
      frequency: definition.frequency,
      entries: (await repos.metrics.inRange(definition.id, metricsFrom, today)).map((row) => ({
        date: row.date,
        value: row.value,
      })),
    })),
  );

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
    habitDates: habitRows.filter((row) => row.value > 0).map((row) => row.date),
    exerciseNames,
    metrics,
    photos,
    poses: photoSpec?.poses ?? [],
    photoGuide: photoSpec?.guide,
    monthlyDone: monthly.length > 0,
  };
}
