// Versioned schema of the full JSON backup (PLAN §13 "respaldo"). Rows mirror the Drizzle tables
// one to one (camelCase column names), so export is a plain SELECT and restore a plain INSERT.
import { z } from 'zod';

import { settingsSchemas } from '../db/repositories/settings';

import { PHOTO_NAME } from '../photos/photoStore';

import { checkinAnswersSchema } from './payloads';

export const BACKUP_FORMAT = 'pomi-backup';
/** Bump when the shape changes; add a migration step in `parse.ts` for the older versions. */
export const BACKUP_SCHEMA_VERSION = 1;

/** Any stored JSON value (the columns are typed `unknown`); only a missing value is rejected. */
const jsonValue = z.custom<unknown>((value) => value !== undefined);

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = z.number().int();
const nullableInt = int.nullable();
const nullableReal = z.number().nullable();
const nullableText = z.string().nullable();

export const profileRowSchema = z.strictObject({
  id: int,
  weightKg: nullableReal,
  heightCm: nullableReal,
  ageYears: nullableInt,
  workType: nullableText,
  level: nullableText,
  goal: nullableText,
  updatedAt: int,
});

/**
 * Keys of features the owner removed ("Conectar mi IA" and its chat history). Old backups and old
 * databases may still hold them: a file with them is still accepted, they are never exported and
 * they are dropped on restore.
 */
export const REMOVED_SETTINGS: readonly string[] = ['aiConnection', 'aiChat'];

export const settingRowSchema = z.strictObject({
  key: z.string().min(1),
  /** JSON text, validated against `settingsSchemas` for the key. */
  value: z.string(),
});

export const templateRowSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['module', 'settings']),
  name: z.string(),
  /** The imported template; validated with the template importer. */
  json: jsonValue,
  importedAt: int,
  active: z.boolean(),
});

export const workoutSessionRowSchema = z.strictObject({
  id: int,
  programId: z.string(),
  routineId: z.string(),
  date: dayKey,
  startedAt: int,
  finishedAt: nullableInt,
});

export const setLogRowSchema = z.strictObject({
  id: int,
  sessionId: int,
  stepId: z.string(),
  setIndex: int,
  weightKg: nullableReal,
  reps: nullableInt,
  rir: int.min(0).max(3).nullable(),
  durationSec: nullableInt,
  doneAt: int,
});

export const habitLogRowSchema = z.strictObject({
  habitId: z.string(),
  date: dayKey,
  value: z.number(),
});

export const habitEventRowSchema = z.strictObject({
  id: int,
  habitId: z.string(),
  date: dayKey,
  at: int,
  value: z.number(),
});

export const stepsRowSchema = z.strictObject({
  date: dayKey,
  steps: int,
  source: z.enum(['health_connect', 'manual']),
});

export const activityRowSchema = z.strictObject({
  id: int,
  date: dayKey,
  kind: z.enum(['gym', 'walk', 'none']),
  source: z.enum(['notification', 'manual']),
  loggedAt: int,
});

export const checkinRowSchema = z.strictObject({
  date: dayKey,
  kind: z.enum(['morning', 'night', 'monthly']),
  answers: checkinAnswersSchema,
});

export const metricEntryRowSchema = z.strictObject({
  id: int,
  metricId: z.string(),
  date: dayKey,
  value: z.number(),
});

export const photoRowSchema = z.strictObject({
  id: int,
  date: dayKey,
  pose: z.string(),
  /** File name in the private photo folder (the image files travel separately). */
  uri: z.string().regex(PHOTO_NAME),
});

export const foodNoteRowSchema = z.strictObject({
  id: int,
  date: dayKey,
  text: z.string(),
});

export const suggestionRowSchema = z.strictObject({
  id: int,
  kind: z.string(),
  payload: jsonValue,
  reason: z.string(),
  createdAt: int,
  status: z.enum(['pending', 'accepted', 'rejected']),
  decidedAt: nullableInt,
});

export const insightRowSchema = z.strictObject({
  id: int,
  kind: z.string(),
  text: z.string(),
  evidence: jsonValue,
  createdAt: int,
  seenAt: nullableInt,
});

export const reminderRowSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string(),
  schedule: jsonValue,
  enabled: z.boolean(),
  createdAt: int,
});

export const backupDataSchema = z.strictObject({
  profile: z.array(profileRowSchema).max(1),
  settings: z.array(settingRowSchema),
  templates: z.array(templateRowSchema),
  workoutSessions: z.array(workoutSessionRowSchema),
  setLogs: z.array(setLogRowSchema),
  habitLogs: z.array(habitLogRowSchema),
  /** Added after the first v1 files: a file without it still restores (no events). */
  habitEvents: z.array(habitEventRowSchema).default([]),
  stepsDaily: z.array(stepsRowSchema),
  activityLogs: z.array(activityRowSchema),
  checkins: z.array(checkinRowSchema),
  metricEntries: z.array(metricEntryRowSchema),
  photos: z.array(photoRowSchema),
  foodNotes: z.array(foodNoteRowSchema),
  suggestions: z.array(suggestionRowSchema),
  insights: z.array(insightRowSchema),
  reminders: z.array(reminderRowSchema),
});

export const backupSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  appVersion: z.string(),
  exportedAt: z.iso.datetime(),
  /** Photo ROWS are only exported when the person opts in; the image files travel separately. */
  includesPhotos: z.boolean(),
  data: backupDataSchema,
});

export type BackupData = z.infer<typeof backupDataSchema>;
export type Backup = z.infer<typeof backupSchema>;
export type BackupTable = keyof BackupData;

export function isKnownSetting(key: string): key is keyof typeof settingsSchemas {
  return Object.prototype.hasOwnProperty.call(settingsSchemas, key);
}
