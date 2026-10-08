import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { loadDefaultTemplates } from '../../templates/defaults';
import { createTestDb } from '../testing/createTestDb';

import { createRepositories, type Repositories } from './index';

let repos: Repositories;
let close: () => void;
let clock = 1_000;

beforeEach(() => {
  const test = createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => clock);
});

afterEach(() => close());

describe('settings', () => {
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

  it('finds the last session for a step and sessions in a range', async () => {
    const make = async (date: string, startedAt: number, stepId: string) => {
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
      return id;
    };
    const first = await make('2026-10-01', 1, 'squat');
    const second = await make('2026-10-03', 3, 'squat');
    const current = await make('2026-10-05', 5, 'squat');
    await make('2026-10-04', 4, 'other');

    expect((await repos.workouts.lastSessionForStep('squat'))?.session.id).toBe(current);
    expect((await repos.workouts.lastSessionForStep('squat', current))?.session.id).toBe(second);
    expect(await repos.workouts.lastSessionForStep('nope')).toBeUndefined();

    const range = await repos.workouts.sessionsInRange('2026-10-02', '2026-10-04');
    expect(range.map((entry) => entry.session.date)).toEqual(['2026-10-03', '2026-10-04']);
    expect(range[0]?.sets).toHaveLength(1);
    expect(first).toBeLessThan(second);
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
