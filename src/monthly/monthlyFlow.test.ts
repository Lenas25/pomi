import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { loadDefaultTemplates } from '../templates/defaults';

import { finishMonthly, loadMonthlyContext, saveMonthlyMeasurements } from './monthlyFlow';

let db: Db;
let repos: Repositories;
let close: () => void;
const present = new Set<string>();
const fs = {
  exists: (name: string) => present.has(name),
  uriOf: (name: string) => `file:///photos/${name}`,
};

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(test.db);
  present.clear();
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
});
afterEach(() => close());

describe('loadMonthlyContext', () => {
  it('lists the metrics and poses of the template, with nothing recorded yet', async () => {
    const context = await loadMonthlyContext(repos, fs, '2026-11-01');
    expect(context.metrics.map((metric) => metric.id)).toEqual([
      'peso',
      'cintura',
      'cadera',
      'gluteo',
    ]);
    expect(context.metrics.every((metric) => metric.latest === undefined)).toBe(true);
    expect(context.poses).toEqual(['frente', 'perfil', 'espalda']);
    // Labels follow the active language (English in tests); the pose ids stay Spanish.
    expect(context.guide).toContain('Same light');
    expect(context.poseNames).toEqual({ frente: 'Front', perfil: 'Side', espalda: 'Back' });
    expect(context.previous).toEqual({ frente: undefined, perfil: undefined, espalda: undefined });
    expect(context.doneThisMonth).toBe(false);
  });

  it('offers the previous photo of each pose (only if its file exists) and the latest values', async () => {
    await repos.photos.add({ date: '2026-09-01', pose: 'frente', uri: 'old.jpg' });
    await repos.photos.add({ date: '2026-10-01', pose: 'frente', uri: 'last.jpg' });
    await repos.photos.add({ date: '2026-10-01', pose: 'perfil', uri: 'missing.jpg' });
    await repos.photos.add({ date: '2026-11-01', pose: 'frente', uri: 'today.jpg' });
    present.add('old.jpg');
    present.add('last.jpg');
    present.add('today.jpg');
    await repos.metrics.upsert('peso', '2026-10-01', 62);
    await repos.metrics.upsert('peso', '2026-10-25', 61.5);

    const context = await loadMonthlyContext(repos, fs, '2026-11-01');
    expect(context.previous.frente).toEqual({ uri: 'file:///photos/last.jpg', date: '2026-10-01' });
    expect(context.previous.perfil).toBeUndefined();
    expect(context.metrics.find((metric) => metric.id === 'peso')?.latest).toEqual({
      date: '2026-10-25',
      value: 61.5,
    });
  });
});

describe('saveMonthlyMeasurements / finishMonthly', () => {
  it('stores the measurements, skips the empty ones and marks the month as done', async () => {
    await saveMonthlyMeasurements(db, repos, '2026-11-01', { peso: 61, cintura: 70.5 });
    expect(await repos.metrics.inRange('peso', '2026-11-01', '2026-11-01')).toMatchObject([
      { value: 61 },
    ]);
    expect(await repos.metrics.inRange('cadera', '2026-11-01', '2026-11-01')).toEqual([]);
    expect((await repos.checkins.get('2026-11-01', 'monthly'))?.answers).toEqual({
      peso: 61,
      cintura: 70.5,
    });
    expect((await loadMonthlyContext(repos, fs, '2026-11-20')).doneThisMonth).toBe(true);
    expect((await loadMonthlyContext(repos, fs, '2026-12-01')).doneThisMonth).toBe(false);
  });

  it('a second save of the day replaces the values and keeps the photo count', async () => {
    await saveMonthlyMeasurements(db, repos, '2026-11-01', { peso: 61 });
    await finishMonthly(db, repos, '2026-11-01', 3);
    await saveMonthlyMeasurements(db, repos, '2026-11-01', { peso: 60.5 });
    expect((await repos.checkins.get('2026-11-01', 'monthly'))?.answers).toEqual({
      peso: 60.5,
      photos: 3,
    });
    expect(await repos.metrics.inRange('peso', '2026-11-01', '2026-11-01')).toHaveLength(1);
  });

  it('can be finished with no measurements and no photos (everything is skippable)', async () => {
    await finishMonthly(db, repos, '2026-11-01', 0);
    expect((await repos.checkins.get('2026-11-01', 'monthly'))?.answers).toEqual({ photos: 0 });
  });
});
