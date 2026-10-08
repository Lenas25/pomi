import { afterEach, describe, expect, it } from '@jest/globals';

import { createRepositories } from './repositories';
import { applyMigrations, createTestDb } from './testing/createTestDb';

let close: (() => void) | undefined;

afterEach(() => {
  close?.();
  close = undefined;
});

describe('migration 0001 on data written by 0000', () => {
  it('normalizes bad rows instead of failing', async () => {
    // Only the first migration: the old schema has no uniqueness or CHECK constraints.
    const test = await createTestDb({ migrationLimit: 1 });
    close = test.close;
    test.exec(`
      insert into metric_entries (metric_id, date, value) values
        ('peso', '2026-10-05', 60), ('peso', '2026-10-05', 59.5), ('peso', '2026-10-06', 59);
      insert into workout_sessions (id, program_id, routine_id, date, started_at)
        values (1, 'p', 'r', '2026-10-05', 1);
      insert into set_logs (session_id, step_id, set_index, rir, done_at) values
        (1, 'a', 0, 2, 1), (1, 'a', 1, 7, 1), (1, 'a', 2, -1, 1), (1, 'a', 3, null, 1);
      insert into steps_daily (date, steps, source) values
        ('2026-10-05', 1000, 'manual'), ('2026-10-06', 2000, 'watch');
      insert into checkins (date, kind, answers) values
        ('2026-10-05', 'morning', '{}'), ('2026-10-05', 'weekly', '{}');
      insert into suggestions (kind, payload, reason, created_at, status) values
        ('k', '{}', 'r', 1, 'pending'), ('k', '{}', 'r', 1, 'weird');
      insert into templates (id, kind, name, json, imported_at, active) values
        ('ok', 'module', 'Ok', '{}', 1, 1), ('bad', 'other', 'Bad', '{}', 1, 1);
    `);

    await applyMigrations(test.db);

    const repos = createRepositories(test.db);
    // Duplicate (metric, day) rows keep the most recent id.
    const metrics = await repos.metrics.inRange('peso', '2026-10-01', '2026-10-31');
    expect(metrics.map((row) => [row.date, row.value])).toEqual([
      ['2026-10-05', 59.5],
      ['2026-10-06', 59],
    ]);
    // Out-of-range RIR becomes NULL.
    const session = await repos.workouts.getSession(1);
    expect(session?.sets.map((set) => set.rir)).toEqual([2, null, null, null]);
    // Unknown enum values are normalized or dropped.
    expect((await repos.steps.inRange('2026-10-01', '2026-10-31')).map((r) => r.source)).toEqual([
      'manual',
      'manual',
    ]);
    expect(await repos.checkins.inRange('2026-10-05', '2026-10-05')).toHaveLength(1);
    expect((await repos.templates.listModules()).length).toBe(0);
    // The new constraints are enforced from now on.
    await expect(repos.metrics.upsert('peso', '2026-10-05', 58)).resolves.toBeUndefined();
  });
});
