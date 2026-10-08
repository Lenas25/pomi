import { withTransaction } from '../transaction';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { sql } from 'drizzle-orm';

import { loadDefaultTemplates } from '../../templates/defaults';
import { settings } from '../schema';
import { createTestDb } from '../testing/createTestDb';

import type { Db } from '../types';

import { createRepositories, type Repositories } from './index';

let repos: Repositories;
let rawDb: Db;
let close: () => void;
let clock = 1_000;

beforeEach(async () => {
  const test = await createTestDb();
  rawDb = test.db;
  close = test.close;
  repos = createRepositories(test.db, () => clock);
});

afterEach(() => close());

describe('settings', () => {
  it('update is a serialized read-modify-write: concurrent patches all land', async () => {
    await Promise.all([
      repos.settings.update('sedentaryNudge', (c) => ({ ...c, windowMin: 90 })),
      repos.settings.update('sedentaryNudge', (c) => ({ ...c, maxPerDay: 3 })),
      repos.settings.update('sedentaryNudge', (c) => ({ ...c, enabled: true })),
    ]);
    expect(await repos.settings.get('sedentaryNudge')).toEqual({
      windowMin: 90,
      maxPerDay: 3,
      enabled: true,
    });
  });

  it('round trips typed values and ignores missing or invalid ones', async () => {
    expect(await repos.settings.get('themeMode')).toBeUndefined();
    await repos.settings.set('themeMode', 'dark');
    await repos.settings.set('themeMode', 'light');
    expect(await repos.settings.get('themeMode')).toBe('light');

    await repos.settings.set('anchors', { wake: '05:10', sleepTargetH: 7.5 });
    expect(await repos.settings.get('anchors')).toEqual({ wake: '05:10', sleepTargetH: 7.5 });

    await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
    await repos.settings.set('activeModules', ['gym', 'agua']);
    expect(await repos.settings.get('activeModules')).toEqual(['gym', 'agua']);

    await repos.settings.remove('themeMode');
    expect(await repos.settings.get('themeMode')).toBeUndefined();
  });
});

describe('settings: notification response claims', () => {
  it('claims a key once, releases it for a retry and keeps a bounded list', async () => {
    expect(await repos.settings.claimNotificationResponse('a')).toBe(true);
    expect(await repos.settings.claimNotificationResponse('a')).toBe(false);
    expect(await repos.settings.claimNotificationResponse('b')).toBe(true);
    await repos.settings.releaseNotificationResponse('a');
    expect(await repos.settings.get('handledNotificationResponses')).toEqual(['b']);
    expect(await repos.settings.claimNotificationResponse('a')).toBe(true);

    for (let index = 0; index < 60; index += 1) {
      await repos.settings.claimNotificationResponse(`k${index}`);
    }
    const kept = (await repos.settings.get('handledNotificationResponses')) ?? [];
    expect(kept).toHaveLength(40);
    expect(kept[39]).toBe('k59');
    expect(await repos.settings.claimNotificationResponse('k59')).toBe(false);
  });

  it('lets exactly one of two concurrent claims win', async () => {
    const results = await Promise.all([
      repos.settings.claimNotificationResponse('same'),
      repos.settings.claimNotificationResponse('same'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('settings with corrupt rows', () => {
  it('treats unparseable JSON and schema mismatches as missing', async () => {
    await rawDb.insert(settings).values({ key: 'themeMode', value: '{not json' });
    await rawDb.insert(settings).values({ key: 'activeModules', value: '"gym"' });
    expect(await repos.settings.get('themeMode')).toBeUndefined();
    expect(await repos.settings.get('activeModules')).toBeUndefined();

    await repos.settings.set('themeMode', 'dark');
    expect(await repos.settings.get('themeMode')).toBe('dark');
  });
});

describe('profile', () => {
  it('merges partial saves into a single row', async () => {
    expect(await repos.profile.get()).toBeUndefined();
    await repos.profile.save({ weightKg: 60, heightCm: 154 });
    clock = 2_000;
    await repos.profile.save({ weightKg: 59.5, workType: 'sentada' });
    expect(await repos.profile.get()).toMatchObject({
      id: 1,
      weightKg: 59.5,
      heightCm: 154,
      workType: 'sentada',
      updatedAt: 2_000,
    });
  });
});

describe('templates', () => {
  it('seeds the defaults once and does not resurrect deleted modules', async () => {
    expect(await repos.templates.seedDefaults()).toBe(true);
    const ids = (await repos.templates.listModules()).map((module) => module.id).sort();
    expect(ids).toEqual(['agua', 'comida-notas', 'gym', 'metricas', 'movimiento', 'sueno']);

    await repos.templates.remove('agua');
    expect(await repos.templates.seedDefaults()).toBe(false);
    expect((await repos.templates.listModules()).map((module) => module.id)).not.toContain('agua');
  });

  it('adds without overwriting and replaces on demand', async () => {
    const [gym] = loadDefaultTemplates().modules;
    if (!gym) throw new Error('gym default missing');
    expect(await repos.templates.saveModules([gym], 'add')).toEqual({
      saved: ['gym'],
      skipped: [],
    });
    expect(await repos.templates.saveModules([gym], 'add')).toEqual({
      saved: [],
      skipped: ['gym'],
    });

    await repos.templates.saveModules([{ ...gym, name: 'Renamed' }], 'replace');
    expect((await repos.templates.getModule('gym'))?.template.name).toBe('Renamed');

    await repos.templates.setActive('gym', false);
    expect((await repos.templates.getModule('gym'))?.active).toBe(false);
  });
});

describe('workouts', () => {
  it('logs, overwrites and unlogs sets', async () => {
    const id = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'd1',
      date: '2026-10-05',
      startedAt: 100,
    });
    await repos.workouts.logSet({
      sessionId: id,
      stepId: 'ht',
      setIndex: 0,
      weightKg: 40,
      reps: 10,
      rir: 2,
      doneAt: 110,
    });
    await repos.workouts.logSet({
      sessionId: id,
      stepId: 'ht',
      setIndex: 0,
      weightKg: 42.5,
      reps: 9,
      doneAt: 120,
    });
    await repos.workouts.logSet({
      sessionId: id,
      stepId: 'ht',
      setIndex: 1,
      weightKg: 42.5,
      reps: 8,
      doneAt: 130,
    });

    let found = await repos.workouts.getSession(id);
    expect(found?.sets).toHaveLength(2);
    expect(found?.sets[0]).toMatchObject({ weightKg: 42.5, reps: 9, rir: null });

    await repos.workouts.unlogSet(id, 'ht', 0);
    await repos.workouts.finishSession(id, 999);
    found = await repos.workouts.getSession(id);
    expect(found?.sets.map((set) => set.setIndex)).toEqual([1]);
    expect(found?.session.finishedAt).toBe(999);
  });

  async function makeSession(
    date: string,
    startedAt: number,
    stepId: string,
    options: { finished?: boolean } = {},
  ): Promise<number> {
    const id = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'r',
      date,
      startedAt,
    });
    await repos.workouts.logSet({
      sessionId: id,
      stepId,
      setIndex: 0,
      weightKg: 10,
      reps: 8,
      doneAt: startedAt,
    });
    if (options.finished ?? true) await repos.workouts.finishSession(id, startedAt + 60);
    return id;
  }

  it('finds the last finished session for a step, skipping the one in progress', async () => {
    await makeSession('2026-10-01', 1, 'squat');
    const second = await makeSession('2026-10-03', 3, 'squat');
    const current = await makeSession('2026-10-05', 5, 'squat');
    await makeSession('2026-10-04', 4, 'other');

    expect((await repos.workouts.lastSessionForStep('squat'))?.session.id).toBe(current);
    expect((await repos.workouts.lastSessionForStep('squat', current))?.session.id).toBe(second);
    expect(await repos.workouts.lastSessionForStep('nope')).toBeUndefined();
  });

  it('counts any session with a logged set as history, finished or not', async () => {
    await makeSession('2026-10-01', 1, 'squat');
    const unfinished = await makeSession('2026-10-03', 3, 'squat', { finished: false });
    expect((await repos.workouts.lastSessionForStep('squat'))?.session.id).toBe(unfinished);
    expect(
      (await repos.workouts.recentSessionsForStep('squat', 5)).map((entry) => entry.session.id),
    ).toContain(unfinished);

    // A session without any set for the step is never history for it.
    const empty = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'd1',
      date: '2026-10-04',
      startedAt: 4,
    });
    expect(empty).toBeGreaterThan(0);
    expect((await repos.workouts.lastSessionForStep('squat'))?.session.id).toBe(unfinished);
    expect(await repos.workouts.lastSessionForStep('bench')).toBeUndefined();
  });

  it('closes sessions left open on earlier days at their last set', async () => {
    const stale = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'd1',
      date: '2026-10-03',
      startedAt: 1000,
    });
    for (const [setIndex, doneAt] of [
      [0, 1100],
      [1, 1900],
    ] as const) {
      await repos.workouts.logSet({ sessionId: stale, stepId: 'squat', setIndex, reps: 8, doneAt });
    }
    const noSets = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'd2',
      date: '2026-10-02',
      startedAt: 500,
    });
    const today = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'd1',
      date: '2026-10-05',
      startedAt: 2000,
    });

    expect(await repos.workouts.finishStaleSessions('2026-10-05')).toBe(2);
    expect((await repos.workouts.getSession(stale))?.session.finishedAt).toBe(1900);
    expect((await repos.workouts.getSession(noSets))?.session.finishedAt).toBe(500);
    expect((await repos.workouts.getSession(today))?.session.finishedAt).toBeNull();
    // Idempotent.
    expect(await repos.workouts.finishStaleSessions('2026-10-05')).toBe(0);
  });

  it('updateRir changes only the RIR and keeps doneAt and the numbers', async () => {
    const id = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'd1',
      date: '2026-10-05',
      startedAt: 100,
    });
    await repos.workouts.logSet({
      sessionId: id,
      stepId: 'ht',
      setIndex: 0,
      weightKg: 40,
      reps: 10,
      rir: null,
      doneAt: 110,
    });
    await repos.workouts.updateRir(id, 'ht', 0, 2);
    const set = (await repos.workouts.getSession(id))?.sets[0];
    expect(set).toMatchObject({ weightKg: 40, reps: 10, rir: 2, doneAt: 110 });
  });

  it('returns several sessions for a step, most recent first, with only that step', async () => {
    await makeSession('2026-10-01', 1, 'squat');
    await makeSession('2026-10-03', 3, 'squat');
    const third = await makeSession('2026-10-05', 5, 'squat');
    await repos.workouts.logSet({
      sessionId: third,
      stepId: 'other',
      setIndex: 0,
      weightKg: 5,
      reps: 5,
      doneAt: 6,
    });
    const unfinished = await makeSession('2026-10-06', 6, 'squat', { finished: false });
    const current = await makeSession('2026-10-07', 7, 'squat');

    const recent = await repos.workouts.recentSessionsForStep('squat', 2, current);
    expect(recent.map((entry) => entry.session.id)).toEqual([unfinished, third]);
    expect(recent.every((entry) => entry.sets.every((set) => set.stepId === 'squat'))).toBe(true);
    expect(await repos.workouts.recentSessionsForStep('nope', 3)).toEqual([]);
  });

  it('finds the unfinished session of a day to resume it', async () => {
    expect(await repos.workouts.unfinishedSessionOn('2026-10-05')).toBeUndefined();
    await makeSession('2026-10-05', 1, 'squat');
    const open = await makeSession('2026-10-05', 2, 'squat', { finished: false });
    await makeSession('2026-10-04', 3, 'squat', { finished: false });
    expect((await repos.workouts.unfinishedSessionOn('2026-10-05'))?.id).toBe(open);
    expect(await repos.workouts.unfinishedSessionOn('2026-10-05', 'r')).toMatchObject({ id: open });
    expect(await repos.workouts.unfinishedSessionOn('2026-10-05', 'other')).toBeUndefined();
    await repos.workouts.finishSession(open, 99);
    expect(await repos.workouts.unfinishedSessionOn('2026-10-05')).toBeUndefined();
  });

  it('lists recent sessions with their sets and deletes a session with its sets', async () => {
    const a = await makeSession('2026-10-01', 1, 'squat');
    const b = await makeSession('2026-10-02', 2, 'squat');
    const recent = await repos.workouts.recentSessions(1);
    expect(recent.map((entry) => entry.session.id)).toEqual([b]);
    expect(recent[0]?.sets).toHaveLength(1);

    await repos.workouts.deleteSession(a);
    expect(await repos.workouts.getSession(a)).toBeUndefined();
    expect((await repos.workouts.recentSessions(5)).map((entry) => entry.session.id)).toEqual([b]);
  });

  it('breaks startedAt ties deterministically by the highest session id', async () => {
    await makeSession('2026-10-02', 7, 'squat');
    const later = await makeSession('2026-10-02', 7, 'squat');
    expect((await repos.workouts.lastSessionForStep('squat'))?.session.id).toBe(later);
    expect((await repos.workouts.lastSessionForStep('squat', later))?.session.id).toBeLessThan(
      later,
    );
  });

  it('only returns the sets of the requested step', async () => {
    const id = await makeSession('2026-10-02', 2, 'squat');
    await repos.workouts.logSet({ sessionId: id, stepId: 'lunge', setIndex: 0, doneAt: 3 });
    const found = await repos.workouts.lastSessionForStep('squat');
    expect(found?.sets.map((set) => set.stepId)).toEqual(['squat']);
  });

  it('lists sessions in a date range with their sets', async () => {
    await makeSession('2026-10-01', 1, 'squat');
    await makeSession('2026-10-03', 3, 'squat');
    await makeSession('2026-10-04', 4, 'other');
    await makeSession('2026-10-06', 6, 'squat');

    const range = await repos.workouts.sessionsInRange('2026-10-02', '2026-10-05');
    expect(range.map((entry) => entry.session.date)).toEqual(['2026-10-03', '2026-10-04']);
    expect(range[0]?.sets).toHaveLength(1);
  });

  it('rejects a reps-in-reserve value outside 0-3', async () => {
    const id = await makeSession('2026-10-02', 2, 'squat');
    await expect(
      repos.workouts.logSet({ sessionId: id, stepId: 'squat', setIndex: 1, rir: 4, doneAt: 3 }),
    ).rejects.toThrow();
  });
});

describe('habit events', () => {
  it('every write leaves the value it produced and when, in order', async () => {
    clock = 100;
    await repos.habitLogs.increment('agua', '2026-10-05');
    clock = 200;
    await repos.habitLogs.increment('agua', '2026-10-05', 2);
    clock = 300;
    await repos.habitLogs.decrement('agua', '2026-10-05');
    clock = 400;
    await repos.habitLogs.set('agua', '2026-10-05', 7);
    clock = 500;
    await repos.habitLogs.decrement('agua', '2026-10-09'); // nothing to decrement: no event
    const events = await repos.habitLogs.eventsInRange('2026-10-01', '2026-10-31', 'agua');
    expect(events.map(({ at, value }) => [at, value])).toEqual([
      [100, 1],
      [200, 3],
      [300, 2],
      [400, 7],
    ]);
    expect(events.every((event) => event.date === '2026-10-05')).toBe(true);
    expect(await repos.habitLogs.eventsInRange('2026-10-06', '2026-10-31')).toEqual([]);
  });
});

describe('habit events: atomicity and retention', () => {
  const DAY_MS = 86_400_000;

  it('a failed event write rolls the log back (one transaction)', async () => {
    await rawDb.run(sql`drop table habit_events`);
    await expect(repos.habitLogs.set('agua', '2026-10-05', 4)).rejects.toThrow();
    await expect(repos.habitLogs.increment('agua', '2026-10-05')).rejects.toThrow();
    expect(await repos.habitLogs.get('agua', '2026-10-05')).toBe(0);
  });

  it('prunes events older than 30 days on the next write, keeps the daily totals', async () => {
    clock = 1_000 * DAY_MS;
    await repos.habitLogs.set('agua', '2026-09-01', 5);
    clock = 1_029 * DAY_MS;
    await repos.habitLogs.set('agua', '2026-09-30', 6);
    expect(await repos.habitLogs.eventsInRange('2026-01-01', '2026-12-31')).toHaveLength(2);
    clock = 1_031 * DAY_MS; // the first event is now 31 days old
    await repos.habitLogs.set('agua', '2026-10-02', 7);
    const events = await repos.habitLogs.eventsInRange('2026-01-01', '2026-12-31');
    expect(events.map((event) => event.value)).toEqual([6, 7]);
    expect(await repos.habitLogs.get('agua', '2026-09-01')).toBe(5);
  });
});

describe('plan change stamps', () => {
  it('stamps gymDaysChangedOn only when the gym days actually change', async () => {
    clock = new Date(2026, 9, 5, 10).getTime();
    await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe('2026-10-05');
    clock = new Date(2026, 9, 9, 10).getTime();
    await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe('2026-10-05');
    await repos.settings.set('gymDays', [{ days: [1, 4], anchor: 'gymMorning' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe('2026-10-09');
  });

  it('compares gym days normalized: the same days in another order are not a change', async () => {
    clock = new Date(2026, 9, 5, 10).getTime();
    await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
    clock = new Date(2026, 9, 9, 10).getTime();
    await repos.settings.set('gymDays', [{ days: [3, 1], anchor: 'gymMorning' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe('2026-10-05');
  });

  it('writes the value and the stamp together, also inside the caller transaction', async () => {
    clock = new Date(2026, 9, 5, 10).getTime();
    await expect(
      withTransaction(rawDb, async () => {
        await repos.settings.set('gymDays', [{ days: [2], anchor: 'gymMorning' }]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repos.settings.get('gymDays')).toBeUndefined();
    expect(await repos.settings.get('gymDaysChangedOn')).toBeUndefined();
    await withTransaction(rawDb, async () => {
      await repos.settings.set('gymDays', [{ days: [2], anchor: 'gymMorning' }]);
    });
    expect(await repos.settings.get('gymDaysChangedOn')).toBe('2026-10-05');
  });

  it('stamps goalsChangedOn for the steps goal and waterGoalChangedOn for water, separately', async () => {
    clock = new Date(2026, 9, 5, 10).getTime();
    await repos.settings.set('goals', { waterGlassesRest: 8 });
    expect(await repos.settings.get('waterGoalChangedOn')).toBe('2026-10-05');
    expect(await repos.settings.get('goalsChangedOn')).toBeUndefined();
    clock = new Date(2026, 9, 8, 10).getTime();
    await repos.settings.set('goals', { waterGlassesRest: 8 });
    expect(await repos.settings.get('waterGoalChangedOn')).toBe('2026-10-05');
    clock = new Date(2026, 9, 12, 10).getTime();
    await repos.settings.set('goals', { waterGlassesRest: 9 });
    expect(await repos.settings.get('waterGoalChangedOn')).toBe('2026-10-12');
    expect(await repos.settings.get('goalsChangedOn')).toBeUndefined();
    clock = new Date(2026, 9, 14, 10).getTime();
    await repos.settings.set('goals', { waterGlassesRest: 9, stepsGoal: 7500 });
    expect(await repos.settings.get('goalsChangedOn')).toBe('2026-10-14');
    expect(await repos.settings.get('waterGoalChangedOn')).toBe('2026-10-12');
  });

  it('gymWeekPlans keys must be ISO Mondays', async () => {
    await repos.settings.set('gymWeekPlans', { '2026-10-06': [] });
    expect(await repos.settings.get('gymWeekPlans')).toBeUndefined();
    await repos.settings.set('gymWeekPlans', { '2026-10-05': [] });
    expect(await repos.settings.get('gymWeekPlans')).toEqual({ '2026-10-05': [] });
  });
});

describe('habit logs', () => {
  it('increments, decrements without going below zero and sets', async () => {
    await repos.habitLogs.increment('agua', '2026-10-05');
    await repos.habitLogs.increment('agua', '2026-10-05', 2);
    expect(await repos.habitLogs.get('agua', '2026-10-05')).toBe(3);

    await repos.habitLogs.decrement('agua', '2026-10-05');
    expect(await repos.habitLogs.get('agua', '2026-10-05')).toBe(2);
    await repos.habitLogs.decrement('agua', '2026-10-05', 10);
    expect(await repos.habitLogs.get('agua', '2026-10-05')).toBe(0);
    await repos.habitLogs.decrement('agua', '2026-10-06');
    expect(await repos.habitLogs.get('agua', '2026-10-06')).toBe(0);

    await repos.habitLogs.set('pausa-activa', '2026-10-05', 1);
    expect(await repos.habitLogs.forDate('2026-10-05')).toHaveLength(2);
    expect(await repos.habitLogs.inRange('2026-10-05', '2026-10-06', 'agua')).toHaveLength(1);
  });

  it('set overwrites the previous value instead of adding to it', async () => {
    await repos.habitLogs.increment('agua', '2026-10-06', 5);
    await repos.habitLogs.set('agua', '2026-10-06', 2);
    expect(await repos.habitLogs.get('agua', '2026-10-06')).toBe(2);
    await repos.habitLogs.set('agua', '2026-10-06', 7);
    expect(await repos.habitLogs.forDate('2026-10-06')).toHaveLength(1);
    expect(await repos.habitLogs.get('agua', '2026-10-06')).toBe(7);
  });
});

describe('metrics', () => {
  it('keeps one value per (metric, day) by upserting', async () => {
    await repos.metrics.upsert('peso', '2026-10-05', 60);
    await repos.metrics.upsert('peso', '2026-10-05', 59.6);
    await repos.metrics.upsert('peso', '2026-10-12', 59.2);
    const rows = await repos.metrics.inRange('peso', '2026-10-01', '2026-10-31');
    expect(rows.map((row) => [row.date, row.value])).toEqual([
      ['2026-10-05', 59.6],
      ['2026-10-12', 59.2],
    ]);
  });
});

describe('transactions and constraints', () => {
  it('rolls back every module when one save fails', async () => {
    const [gym] = loadDefaultTemplates().modules;
    if (!gym) throw new Error('gym default missing');
    const broken = { ...gym, id: 'broken', name: undefined } as unknown as typeof gym;
    await expect(repos.templates.saveModules([gym, broken], 'add')).rejects.toThrow();
    expect(await repos.templates.listModules()).toEqual([]);
  });

  it('skips a module id repeated inside one add batch', async () => {
    const [gym] = loadDefaultTemplates().modules;
    if (!gym) throw new Error('gym default missing');
    expect(await repos.templates.saveModules([gym, { ...gym, name: 'Dup' }], 'add')).toEqual({
      saved: ['gym'],
      skipped: ['gym'],
    });
    expect((await repos.templates.getModule('gym'))?.template.name).toEqual(gym.name);
  });

  it('rejects values outside the enum columns', async () => {
    await expect(
      repos.steps.upsert('2026-10-05', 1000, 'watch' as unknown as 'manual'),
    ).rejects.toThrow();
    await expect(
      repos.checkins.upsert('2026-10-05', 'weekly' as unknown as 'morning', {}),
    ).rejects.toThrow();
  });
});

describe('steps and check-ins', () => {
  it('upserts daily steps', async () => {
    await repos.steps.upsert('2026-10-05', 4000, 'manual');
    await repos.steps.upsert('2026-10-05', 6500, 'health_connect');
    expect(await repos.steps.get('2026-10-05')).toEqual({
      date: '2026-10-05',
      steps: 6500,
      source: 'health_connect',
    });
    expect(await repos.steps.inRange('2026-10-01', '2026-10-31')).toHaveLength(1);
  });

  it('upserts check-ins by (date, kind)', async () => {
    await repos.checkins.upsert('2026-10-05', 'morning', { 'calidad-sueno': 3 });
    await repos.checkins.upsert('2026-10-05', 'morning', { 'calidad-sueno': 4 });
    await repos.checkins.upsert('2026-10-05', 'night', { energia: 5 });
    expect((await repos.checkins.get('2026-10-05', 'morning'))?.answers).toEqual({
      'calidad-sueno': 4,
    });
    expect(await repos.checkins.inRange('2026-10-05', '2026-10-05')).toHaveLength(2);
    expect(await repos.checkins.inRange('2026-10-05', '2026-10-05', 'night')).toHaveLength(1);
  });
});
