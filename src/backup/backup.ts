// Export and restore of ALL user data. Pure over a `Db` (no Expo imports), so it is tested on the
// in-memory test database; `files.ts` and the screens wire it to the file system.
import { asc } from 'drizzle-orm';

import {
  activityLogs,
  checkins,
  foodNotes,
  habitEvents,
  habitLogs,
  insights,
  metricEntries,
  photos,
  profile,
  reminders,
  settings,
  setLogs,
  stepsDaily,
  suggestions,
  templates,
  workoutSessions,
} from '../db/schema';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';

import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, type Backup, type BackupData } from './schema';

export type ExportOptions = {
  appVersion: string;
  /** Include the photo rows (image files are not embedded yet: v2). Default false. */
  includePhotos?: boolean;
  now?: () => Date;
};

/** Reads every table (deterministic order) into a backup document. */
export async function createBackup(db: Db, options: ExportOptions): Promise<Backup> {
  const includePhotos = options.includePhotos ?? false;
  const now = options.now ?? (() => new Date());
  const data: BackupData = {
    profile: await db.select().from(profile),
    settings: await db.select().from(settings).orderBy(asc(settings.key)),
    templates: await db.select().from(templates).orderBy(asc(templates.id)),
    workoutSessions: await db.select().from(workoutSessions).orderBy(asc(workoutSessions.id)),
    setLogs: await db.select().from(setLogs).orderBy(asc(setLogs.id)),
    habitLogs: await db
      .select()
      .from(habitLogs)
      .orderBy(asc(habitLogs.date), asc(habitLogs.habitId)),
    habitEvents: await db.select().from(habitEvents).orderBy(asc(habitEvents.id)),
    stepsDaily: await db.select().from(stepsDaily).orderBy(asc(stepsDaily.date)),
    activityLogs: await db.select().from(activityLogs).orderBy(asc(activityLogs.id)),
    checkins: await db.select().from(checkins).orderBy(asc(checkins.date), asc(checkins.kind)),
    metricEntries: await db.select().from(metricEntries).orderBy(asc(metricEntries.id)),
    photos: includePhotos ? await db.select().from(photos).orderBy(asc(photos.id)) : [],
    foodNotes: await db.select().from(foodNotes).orderBy(asc(foodNotes.id)),
    suggestions: await db.select().from(suggestions).orderBy(asc(suggestions.id)),
    insights: await db.select().from(insights).orderBy(asc(insights.id)),
    reminders: await db.select().from(reminders).orderBy(asc(reminders.id)),
  };
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: now().toISOString(),
    includesPhotos: includePhotos,
    data,
  };
}

/** Rows per INSERT: SQLite allows 999 bound variables and the widest table has 9 columns. */
const CHUNK = 80;

async function insertChunks<Row>(
  rows: readonly Row[],
  insert: (chunk: Row[]) => PromiseLike<unknown>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await insert(rows.slice(index, index + CHUNK));
  }
}

/**
 * Replaces ALL user data with the backup, in ONE transaction: any failure (a CHECK, a foreign key,
 * a duplicate key) rolls everything back and the current data stays untouched. Photo rows are only
 * replaced when the backup includes them. The caller reschedules notifications and re-hydrates the
 * in-memory stores afterwards.
 */
export async function restoreBackup(db: Db, backup: Backup): Promise<void> {
  const { data } = backup;
  await withTransaction(db, async () => {
    // Children first so foreign keys never see an orphan.
    await db.delete(setLogs);
    await db.delete(workoutSessions);
    await db.delete(habitLogs);
    await db.delete(habitEvents);
    await db.delete(stepsDaily);
    await db.delete(activityLogs);
    await db.delete(checkins);
    await db.delete(metricEntries);
    if (backup.includesPhotos) await db.delete(photos);
    await db.delete(foodNotes);
    await db.delete(suggestions);
    await db.delete(insights);
    await db.delete(reminders);
    await db.delete(templates);
    await db.delete(profile);
    await db.delete(settings);

    await insertChunks(data.profile, (rows) => db.insert(profile).values(rows));
    await insertChunks(data.settings, (rows) => db.insert(settings).values(rows));
    await insertChunks(data.templates, (rows) => db.insert(templates).values(rows));
    await insertChunks(data.workoutSessions, (rows) => db.insert(workoutSessions).values(rows));
    await insertChunks(data.setLogs, (rows) => db.insert(setLogs).values(rows));
    await insertChunks(data.habitLogs, (rows) => db.insert(habitLogs).values(rows));
    await insertChunks(data.habitEvents, (rows) => db.insert(habitEvents).values(rows));
    await insertChunks(data.stepsDaily, (rows) => db.insert(stepsDaily).values(rows));
    await insertChunks(data.activityLogs, (rows) => db.insert(activityLogs).values(rows));
    await insertChunks(data.checkins, (rows) => db.insert(checkins).values(rows));
    await insertChunks(data.metricEntries, (rows) => db.insert(metricEntries).values(rows));
    if (backup.includesPhotos) {
      await insertChunks(data.photos, (rows) => db.insert(photos).values(rows));
    }
    await insertChunks(data.foodNotes, (rows) => db.insert(foodNotes).values(rows));
    await insertChunks(data.suggestions, (rows) => db.insert(suggestions).values(rows));
    await insertChunks(data.insights, (rows) => db.insert(insights).values(rows));
    await insertChunks(data.reminders, (rows) => db.insert(reminders).values(rows));
  });
}

export type BackupSummary = {
  appVersion: string;
  exportedAt: string;
  includesPhotos: boolean;
  counts: {
    templates: number;
    workouts: number;
    sets: number;
    habitLogs: number;
    checkins: number;
    stepDays: number;
    activityLogs: number;
    metricEntries: number;
    foodNotes: number;
    photos: number;
  };
};

/** Counts shown in the preview before the person confirms the restore. */
export function summarizeBackup(backup: Backup): BackupSummary {
  const { data } = backup;
  return {
    appVersion: backup.appVersion,
    exportedAt: backup.exportedAt,
    includesPhotos: backup.includesPhotos,
    counts: {
      templates: data.templates.length,
      workouts: data.workoutSessions.length,
      sets: data.setLogs.length,
      habitLogs: data.habitLogs.length,
      checkins: data.checkins.length,
      stepDays: data.stepsDaily.length,
      activityLogs: data.activityLogs.length,
      metricEntries: data.metricEntries.length,
      foodNotes: data.foodNotes.length,
      photos: data.photos.length,
    },
  };
}
