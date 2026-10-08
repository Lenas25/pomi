// The monthly review (PLAN §10): load what the flow needs, save the measurements and close the
// review. Pure over repositories and the photo file port, so it runs in Jest on the real migrations.
import { startOfMonth, format, parseISO } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';
import { latestEntry, type MetricFrequency, type MetricPoint } from '../domain/progress/metrics';
import { previousPhoto, type PhotoFs } from '../photos/photoStore';

export type MonthlyMetric = {
  id: string;
  name: string;
  unit: string;
  frequency: MetricFrequency;
  latest: MetricPoint | undefined;
};

export type MonthlyContext = {
  metrics: MonthlyMetric[];
  poses: string[];
  guide?: string | undefined;
  /** Per pose: the latest earlier photo whose file still exists (drawn over the camera). */
  previous: Record<string, { uri: string; date: string } | undefined>;
  /** A monthly check-in already exists for this calendar month. */
  doneThisMonth: boolean;
  /** `backupReminder` setting (default on): show the gentle "export your backup" line. */
  backupReminder: boolean;
};

const LOOKBACK_FROM = '2000-01-01';

export async function loadMonthlyContext(
  repos: Repositories,
  fs: Pick<PhotoFs, 'exists' | 'uriOf'>,
  today: string,
): Promise<MonthlyContext> {
  const modules = (await repos.templates.listModules()).filter((module) => module.active);
  const definitions = modules.flatMap((module) => module.template.metrics ?? []);
  const photoSpec = modules.map((module) => module.template.photos).find((spec) => spec);
  const poses = photoSpec?.poses ?? [];

  const metrics = await Promise.all(
    definitions.map(async (definition): Promise<MonthlyMetric> => ({
      id: definition.id,
      name: definition.name,
      unit: definition.unit,
      frequency: definition.frequency,
      latest: latestEntry(
        (await repos.metrics.inRange(definition.id, LOOKBACK_FROM, today)).map((row) => ({
          date: row.date,
          value: row.value,
        })),
      ),
    })),
  );

  const previous: MonthlyContext['previous'] = {};
  for (const pose of poses) {
    const photo = await previousPhoto(repos.photos, pose, today, fs);
    previous[pose] = photo ? { uri: fs.uriOf(photo.uri), date: photo.date } : undefined;
  }

  const monthStart = format(startOfMonth(parseISO(today)), 'yyyy-MM-dd');
  return {
    metrics,
    poses,
    guide: photoSpec?.guide,
    previous,
    doneThisMonth: (await repos.checkins.inRange(monthStart, today, 'monthly')).length > 0,
    backupReminder: (await repos.settings.get('backupReminder')) ?? true,
  };
}

/**
 * Saves the measurements of the review (the ones left empty are skipped) and records the monthly
 * check-in for `today`, in one transaction. Answers merge with an earlier save of the same day.
 */
export async function saveMonthlyMeasurements(
  db: Db,
  repos: Repositories,
  today: string,
  values: Readonly<Record<string, number>>,
): Promise<void> {
  await withTransaction(db, async () => {
    for (const [metricId, value] of Object.entries(values)) {
      await repos.metrics.upsert(metricId, today, value);
    }
    await mergeAnswers(repos, today, values);
  });
}

/** Closes the review: records how many photos were taken (the check-in marks the month as done). */
export async function finishMonthly(
  db: Db,
  repos: Repositories,
  today: string,
  photoCount: number,
): Promise<void> {
  await withTransaction(db, async () => {
    await mergeAnswers(repos, today, { photos: photoCount });
  });
}

async function mergeAnswers(
  repos: Repositories,
  today: string,
  answers: Readonly<Record<string, number>>,
): Promise<void> {
  const existing = (await repos.checkins.get(today, 'monthly'))?.answers ?? {};
  await repos.checkins.upsert(today, 'monthly', { ...existing, ...answers });
}
