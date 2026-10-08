import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Conventions: day keys are `yyyy-MM-dd` text, timestamps are integer epoch milliseconds,
 * booleans use integer mode, JSON payloads use text mode json.
 */

export const profile = sqliteTable('profile', {
  /** Single row, always id 1. */
  id: integer('id').primaryKey(),
  weightKg: real('weight_kg'),
  heightCm: real('height_cm'),
  ageYears: integer('age_years'),
  workType: text('work_type'),
  level: text('level'),
  goal: text('goal'),
  updatedAt: integer('updated_at').notNull(),
});

/** Key/value store. `value` holds JSON text; keys are typed in the settings repository. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Imported templates (one row per module) and, in the future, settings templates. */
export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['module', 'settings'] }).notNull(),
  name: text('name').notNull(),
  json: text('json', { mode: 'json' }).$type<unknown>().notNull(),
  importedAt: integer('imported_at').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    programId: text('program_id').notNull(),
    routineId: text('routine_id').notNull(),
    date: text('date').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (table) => [index('workout_sessions_date_idx').on(table.date)],
);

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    stepId: text('step_id').notNull(),
    setIndex: integer('set_index').notNull(),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    /** Reps in reserve, 0-3. */
    rir: integer('rir'),
    durationSec: integer('duration_sec'),
    doneAt: integer('done_at').notNull(),
  },
  (table) => [
    uniqueIndex('set_logs_session_step_set_idx').on(table.sessionId, table.stepId, table.setIndex),
    index('set_logs_step_idx').on(table.stepId),
  ],
);

export const habitLogs = sqliteTable(
  'habit_logs',
  {
    habitId: text('habit_id').notNull(),
    date: text('date').notNull(),
    value: real('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.habitId, table.date] })],
);

export const stepsDaily = sqliteTable('steps_daily', {
  date: text('date').primaryKey(),
  steps: integer('steps').notNull(),
  source: text('source', { enum: ['health_connect', 'manual'] }).notNull(),
});

export const checkins = sqliteTable(
  'checkins',
  {
    date: text('date').notNull(),
    kind: text('kind', { enum: ['morning', 'night', 'monthly'] }).notNull(),
    answers: text('answers', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.date, table.kind] })],
);

export const metricEntries = sqliteTable(
  'metric_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    metricId: text('metric_id').notNull(),
    date: text('date').notNull(),
    value: real('value').notNull(),
  },
  (table) => [index('metric_entries_metric_date_idx').on(table.metricId, table.date)],
);

export const photos = sqliteTable(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    pose: text('pose').notNull(),
    /** Local file URI. */
    uri: text('uri').notNull(),
  },
  (table) => [index('photos_date_idx').on(table.date)],
);

export const foodNotes = sqliteTable(
  'food_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    text: text('text').notNull(),
  },
  (table) => [index('food_notes_date_idx').on(table.date)],
);

export const suggestions = sqliteTable('suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
  reason: text('reason').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
  decidedAt: integer('decided_at'),
});

export const insights = sqliteTable('insights', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  evidence: text('evidence', { mode: 'json' }).$type<unknown>().notNull(),
  createdAt: integer('created_at').notNull(),
  seenAt: integer('seen_at'),
});

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  /** Schedule JSON (see `Schedule` in src/templates/schema.ts). */
  schedule: text('schedule', { mode: 'json' }).$type<unknown>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
});
