import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { photos, reminders, suggestions, insights } from '../db/schema';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { loadDefaultTemplates } from '../templates/defaults';

import { createBackup, restoreBackup, summarizeBackup } from './backup';
import { describeBackupError } from './describeError';
import { parseBackupText } from './parse';
import type { Backup } from './schema';

type Fixture = { db: Db; repos: Repositories; close: () => void };

async function openDb(): Promise<Fixture> {
  const test = await createTestDb();
  return { db: test.db, repos: createRepositories(test.db, () => 5_000), close: test.close };
}

async function seed({ db, repos }: Fixture): Promise<void> {
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await repos.profile.save({ weightKg: 61.5, workType: 'sentada', level: 'principiante' });
  await repos.settings.set('anchors', { wake: '06:00', sleepTargetH: 7.5 });
  await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
  await repos.settings.set('themeMode', 'dark');
  await repos.settings.set('onboardingComplete', true);
  await repos.settings.set('startedOn', '2026-10-01');
  const sessionId = await repos.workouts.createSession({
    programId: 'p',
    routineId: 'r1',
    date: '2026-10-05',
    startedAt: 1_000,
  });
  await repos.workouts.logSet({
    sessionId,
    stepId: 's1',
    setIndex: 0,
    weightKg: 40,
    reps: 10,
    rir: 2,
    doneAt: 2_000,
  });
  await repos.workouts.logSet({
    sessionId,
    stepId: 's1',
    setIndex: 1,
    weightKg: 40,
    reps: 9,
    rir: 1,
    doneAt: 3_000,
  });
  await repos.workouts.finishSession(sessionId, 4_000);
  await repos.habitLogs.set('agua', '2026-10-05', 7);
  await repos.steps.upsert('2026-10-05', 6400, 'manual');
  await repos.steps.upsert('2026-10-04', 8000, 'health_connect');
  await repos.activity.upsert('2026-10-05', 'walk', 'notification');
  await repos.checkins.upsert('2026-10-05', 'night', { energy: 4, note: 'ok' });
  await repos.metrics.upsert('peso', '2026-10-05', 61.5);
  await repos.foodNotes.save('2026-10-05', 'Lentejas');
  await db
    .insert(suggestions)
    .values({ kind: 'k', payload: { a: 1 }, reason: 'r', createdAt: 1, status: 'pending' });
  await db.insert(insights).values({ kind: 'k', text: 'texto', evidence: [1, 2], createdAt: 1 });
  await db
    .insert(reminders)
    .values({ id: 'rem', text: 'Beber', schedule: { time: '10:00' }, enabled: true, createdAt: 1 });
  await db.insert(photos).values({ date: '2026-10-05', pose: 'front', uri: 'file:///a.jpg' });
}

let source: Fixture;
let target: Fixture;
const OPTIONS = { appVersion: '1.2.3', now: () => new Date('2026-10-07T10:00:00.000Z') };

beforeEach(async () => {
  source = await openDb();
  target = await openDb();
  await seed(source);
});

afterEach(() => {
  source.close();
  target.close();
});

function parse(backup: Backup): Backup {
  const result = parseBackupText(JSON.stringify(backup));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.backup;
}

describe('backup export / restore', () => {
  it('round trips every table: export -> file text -> import -> export is identical', async () => {
    const original = await createBackup(source.db, { ...OPTIONS, includePhotos: true });
    expect(original.data.setLogs).toHaveLength(2);
    expect(original.data.templates.length).toBeGreaterThan(0);
    expect(original.data.photos).toHaveLength(1);
    // Every habit write leaves an event (the suggestions engine reads them).
    expect(original.data.habitEvents).toEqual([
      { id: 1, habitId: 'agua', date: '2026-10-05', at: 5_000, value: 7 },
    ]);

    // The target already has unrelated data that must disappear.
    await target.repos.habitLogs.set('otro', '2026-01-01', 1);
    await target.repos.settings.set('userName', 'Borrar');

    await restoreBackup(target.db, parse(original));
    const restored = await createBackup(target.db, { ...OPTIONS, includePhotos: true });
    expect(restored).toEqual(original);
    expect(await target.repos.settings.get('userName')).toBeUndefined();
    expect((await target.repos.workouts.getSession(1))?.sets).toHaveLength(2);
  });

  it('restores a file written before habit events existed (no habitEvents key)', async () => {
    const original = await createBackup(source.db, OPTIONS);
    const { habitEvents: _omitted, ...dataWithout } = original.data;
    const result = parseBackupText(JSON.stringify({ ...original, data: dataWithout }));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.backup.data.habitEvents).toEqual([]);
    await restoreBackup(target.db, result.backup);
    expect((await createBackup(target.db, OPTIONS)).data.habitEvents).toEqual([]);
  });

  it('leaves photos out unless asked, and keeps existing photo rows when the backup has none', async () => {
    const withoutPhotos = await createBackup(source.db, OPTIONS);
    expect(withoutPhotos.includesPhotos).toBe(false);
    expect(withoutPhotos.data.photos).toEqual([]);

    await restoreBackup(target.db, parse(withoutPhotos));
    await target.db
      .insert(photos)
      .values({ date: '2026-10-06', pose: 'side', uri: 'file:///b.jpg' });
    await restoreBackup(target.db, parse(withoutPhotos));
    expect(
      (await createBackup(target.db, { ...OPTIONS, includePhotos: true })).data.photos,
    ).toHaveLength(1);
  });

  it('summarizes the counts for the preview', async () => {
    const summary = summarizeBackup(await createBackup(source.db, OPTIONS));
    expect(summary).toMatchObject({
      appVersion: '1.2.3',
      counts: { workouts: 1, sets: 2, stepDays: 2, checkins: 1, foodNotes: 1, photos: 0 },
    });
  });

  it('rolls back everything when any row fails, keeping the current data', async () => {
    await restoreBackup(target.db, parse(await createBackup(source.db, OPTIONS)));
    const before = await createBackup(target.db, OPTIONS);

    const broken = parse(await createBackup(source.db, OPTIONS));
    broken.data.habitLogs = [{ habitId: 'nuevo', date: '2026-10-09', value: 3 }];
    // Passes the file validation but violates the CHECK constraint at insert time.
    broken.data.stepsDaily = [{ date: '2026-10-09', steps: 1, source: 'bogus' as 'manual' }];

    await expect(restoreBackup(target.db, broken)).rejects.toThrow();
    expect(await createBackup(target.db, OPTIONS)).toEqual(before);
  });
});

describe('parseBackupText', () => {
  const t = (key: string, options?: Record<string, string | number>) =>
    `${key}${options ? JSON.stringify(options) : ''}`;

  it('rejects text that is not JSON, with the line when known', () => {
    const result = parseBackupText('{\n"format": "pomi-backup",\n oops');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ kind: 'file', code: 'invalidJson' });
  });

  it('rejects other JSON files', () => {
    const result = parseBackupText(JSON.stringify({ kind: 'module', schemaVersion: 2 }));
    expect(result).toMatchObject({ ok: false, errors: [{ kind: 'file', code: 'notBackup' }] });
    expect(parseBackupText('[]')).toMatchObject({ ok: false });
  });

  it('rejects older and newer versions with their own error', async () => {
    const base = await createBackup(source.db, OPTIONS);
    const older = parseBackupText(JSON.stringify({ ...base, schemaVersion: 0 }));
    expect(older).toMatchObject({
      ok: false,
      errors: [{ kind: 'file', code: 'olderVersion', found: 0 }],
    });
    const newer = parseBackupText(JSON.stringify({ ...base, schemaVersion: 99 }));
    expect(newer).toMatchObject({
      ok: false,
      errors: [{ kind: 'file', code: 'newerVersion', found: 99 }],
    });
    if (!newer.ok) {
      expect(describeBackupError(newer.errors[0]!, t)).toContain('backup.errors.newerVersion');
    }
  });

  it('points at the broken field with its path, in readable errors', async () => {
    const base = await createBackup(source.db, OPTIONS);
    const corrupt = JSON.parse(JSON.stringify(base)) as Backup;
    corrupt.data.stepsDaily[0]!.steps = 'muchos' as unknown as number;
    delete (
      corrupt.data.workoutSessions[0] as Partial<(typeof corrupt.data.workoutSessions)[number]>
    ).routineId;
    const result = parseBackupText(JSON.stringify(corrupt));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((error) => (error.kind === 'field' ? error.error.path : ''));
      expect(paths).toEqual(
        expect.arrayContaining(['data.stepsDaily[0].steps', 'data.workoutSessions[0].routineId']),
      );
    }
  });

  it('rejects unknown settings, invalid templates and orphan sets', async () => {
    const base = await createBackup(source.db, OPTIONS);
    const corrupt = JSON.parse(JSON.stringify(base)) as Backup;
    corrupt.data.settings.push({ key: 'inventada', value: '1' });
    corrupt.data.settings.push({ key: 'themeMode', value: '"rosa"' });
    corrupt.data.templates[0]!.json = { kind: 'module', schemaVersion: 2, id: 'x' };
    corrupt.data.setLogs[0]!.sessionId = 999;
    const result = parseBackupText(JSON.stringify(corrupt));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((error) => (error.kind === 'field' ? error.error.path : ''));
      expect(paths).toContain(`data.settings[${base.data.settings.length}].key`);
      expect(paths).toContain(`data.settings[${base.data.settings.length + 1}].value`);
      expect(paths.some((path) => path.startsWith('data.templates[0].json'))).toBe(true);
      expect(paths).toContain('data.setLogs[0].sessionId');
    }
  });
});
