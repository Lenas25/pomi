// Repositories -> `ProgressData`. The numbers are computed by the pure functions in
// `src/domain/progress` and `progressView.ts`; this file only reads.
import { format, parseISO, startOfMonth, subDays } from 'date-fns';

import { loadCompanion } from '../companion/loadCompanion';
import { parseInsightRow, type StoredInsight } from '../insights/payload';
import type { Repositories } from '../db/repositories';
import type { PhotoRow } from '../db/repositories/photos';
import type { Companion } from '../domain/companion';
import type { MetricFrequency, MetricPoint } from '../domain/progress/metrics';
import type { SessionSets } from '../domain/progress/strength';
import { DEFAULT_WEEKS } from '../domain/progress/weekly';
import { pickProgram } from '../gym/program';
import { loadVolumeData, type VolumeData } from '../volume/loadVolume';
import type { GymWeekPlans } from '../domain/gym/gymPlan';
import type { GymDays, GymPlan } from '../templates/schema';
import { currentLanguage, templateText } from '../i18n/templateText';
import { poseEntries } from '../templates/localized';

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
  /** Per-day plan and week overrides (planned sessions per week follow them). */
  gymPlan?: GymPlan | undefined;
  gymWeekPlans?: GymWeekPlans | undefined;
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
  /** Pose id -> label in the active language. */
  poseNames: Record<string, string>;
  /** The template's short guide for taking the photos. */
  photoGuide?: string | undefined;
  /** A monthly review already exists for the current month. */
  monthlyDone: boolean;
  /** "Tu ritmo" (PLAN §14b); `null` when it could not be computed (it never blocks Progreso). */
  companion?: Companion | null | undefined;
  /** Every readable insight, newest first (PLAN §12). */
  insights?: StoredInsight[] | undefined;
  /** Weekly volume per muscle (PLAN §9.4); `null` when it could not be computed. */
  volume?: VolumeData | null | undefined;
};

const key = (date: Date) => format(date, 'yyyy-MM-dd');

export async function loadProgressData(repos: Repositories, today: string): Promise<ProgressData> {
  const now = parseISO(today);
  const sessionsFrom = key(subDays(now, STRENGTH_LOOKBACK_DAYS));
  const habitsFrom = key(subDays(now, DEFAULT_WEEKS * 7));
  const metricsFrom = key(subDays(now, METRIC_LOOKBACK_DAYS));

  const monthStart = key(startOfMonth(now));
  const [gymPlan, gymWeekPlans] = await Promise.all([
    repos.settings.get('gymPlan'),
    repos.settings.get('gymWeekPlans'),
  ]);
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
      if (step.type === 'sets') exerciseNames[step.id] = templateText(step.name);
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
      name: templateText(definition.name),
      unit: templateText(definition.unit),
      frequency: definition.frequency,
      entries: (await repos.metrics.inRange(definition.id, metricsFrom, today)).map((row) => ({
        date: row.date,
        value: row.value,
      })),
    })),
  );

  const companion = await loadCompanion(repos, today).catch((error: unknown) => {
    if (__DEV__) console.warn('Could not compute Tu ritmo', error);
    return null;
  });

  const insights = await repos.insights
    .all()
    .then((rows) => rows.flatMap((row) => parseInsightRow(row) ?? []))
    .catch((error: unknown) => {
      if (__DEV__) console.warn('Could not read the insights', error);
      return [];
    });

  const volume = await loadVolumeData(repos, today).catch((error: unknown) => {
    if (__DEV__) console.warn('Could not compute the weekly volume', error);
    return null;
  });

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
    habitDates: habitRows.filter((row) => row.value > 0).map((row) => row.date),
    exerciseNames,
    metrics,
    photos,
    ...(() => {
      const { ids, names } = poseEntries(photoSpec?.poses ?? [], currentLanguage());
      return { poses: ids, poseNames: names };
    })(),
    photoGuide: templateText(photoSpec?.guide),
    monthlyDone: monthly.length > 0,
    companion,
    insights,
    volume,
  };
}
