import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { loadDefaultTemplates } from '../templates/defaults';
import { loadSleepSummary } from '../habits/sleepStats';
import { loadCheckin, saveCheckin, type CheckinPlan } from './checkinFlow';

let db: Db;
let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(db);
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await repos.settings.set('anchors', { wake: '06:30', sleepTargetH: 7.5 });
});

afterEach(() => close());

async function ready(kind: 'morning' | 'night', day: string): Promise<CheckinPlan> {
  const loaded = await loadCheckin(repos, kind, day);
  if (loaded.status !== 'ready') throw new Error(`not ready: ${loaded.status}`);
  return loaded.plan;
}

describe('loadCheckin', () => {
  it('prefills bed and wake from the plan anchors (bed = wake - sleep target)', async () => {
    const plan = await ready('morning', '2026-10-06');
    expect(plan.answers).toEqual({ 'hora-dormir': '23:00', 'hora-despertar': '06:30' });
    expect(plan.questions.map((q) => q.id)).toEqual([
      'hora-dormir',
      'hora-despertar',
      'calidad-sueno',
    ]);
    expect(plan.foodPrompt).toBeNull();
  });

  it('prefills the bed time with the last LOGGED bedtime, the plan only as a fallback', async () => {
    await repos.settings.set('planShifts', { bedMin: -15 });
    // Nothing logged yet: the plan (06:30 - 7.5 h = 23:00, moved 15 min earlier).
    expect((await ready('morning', '2026-10-06')).answers['hora-dormir']).toBe('22:45');
    await repos.checkins.upsert('2026-10-03', 'morning', {
      'hora-dormir': '00:10',
      'hora-despertar': '07:00',
      'calidad-sueno': 3,
    });
    await repos.checkins.upsert('2026-10-05', 'morning', {
      'hora-dormir': '23:50',
      'hora-despertar': '06:40',
      'calidad-sueno': 4,
    });
    // The most recent EARLIER morning wins; today's own saved answer is not a "previous" one.
    expect((await ready('morning', '2026-10-06')).answers['hora-dormir']).toBe('23:50');
    expect((await ready('morning', '2026-10-06')).answers['hora-despertar']).toBe('06:30');
    // Older than two weeks no longer counts.
    expect((await ready('morning', '2026-10-30')).answers['hora-dormir']).toBe('22:45');
  });

  it('adds the food prompt to the night check-in when the module is active', async () => {
    const plan = await ready('night', '2026-10-06');
    expect(plan.foodPrompt).toBe('¿Qué comiste hoy y cómo te sentiste?');
    await repos.templates.setActive('comida-notas', false);
    expect((await ready('night', '2026-10-06')).foodPrompt).toBeNull();
  });

  it('respects the person turning a check-in off, and a missing module', async () => {
    await repos.settings.set('checkinPrefs', { morning: false, night: true, monthlyReviewDay: 1 });
    expect((await loadCheckin(repos, 'morning', '2026-10-06')).status).toBe('disabled');
    await repos.templates.setActive('metricas', false);
    expect((await loadCheckin(repos, 'night', '2026-10-06')).status).toBe('missing');
  });
});

describe('saveCheckin', () => {
  it('rejects missing answers without writing, naming the first question', async () => {
    const plan = await ready('morning', '2026-10-06');
    const result = await saveCheckin(db, repos, plan, '2026-10-06', plan.answers, '');
    expect(result).toMatchObject({ ok: false, question: { id: 'calidad-sueno' } });
    expect(await repos.checkins.get('2026-10-06', 'morning')).toBeUndefined();
  });

  it('upserts by (date, kind): a second save replaces the first', async () => {
    const plan = await ready('morning', '2026-10-06');
    await saveCheckin(db, repos, plan, '2026-10-06', { ...plan.answers, 'calidad-sueno': 3 }, '');
    await saveCheckin(db, repos, plan, '2026-10-06', { ...plan.answers, 'calidad-sueno': 5 }, '');
    expect((await repos.checkins.get('2026-10-06', 'morning'))?.answers).toEqual({
      'hora-dormir': '23:00',
      'hora-despertar': '06:30',
      'calidad-sueno': 5,
    });
    // Reopening shows what was saved, not the plan.
    expect((await ready('morning', '2026-10-06')).answers['calidad-sueno']).toBe(5);
  });

  it('stores the night note and the food note together, and removes a blank food note', async () => {
    const plan = await ready('night', '2026-10-06');
    const base = { energia: 4, animo: 3, nota: 'Buen día' };
    expect(await saveCheckin(db, repos, plan, '2026-10-06', base, 'Pasta')).toEqual({ ok: true });
    expect((await repos.checkins.get('2026-10-06', 'night'))?.answers).toEqual(base);
    expect((await repos.foodNotes.forDate('2026-10-06'))?.text).toBe('Pasta');
    await saveCheckin(db, repos, plan, '2026-10-06', base, '   ');
    expect(await repos.foodNotes.forDate('2026-10-06')).toBeUndefined();
  });

  it('feeds the sleep summary (average duration and wake regularity)', async () => {
    const plan = await ready('morning', '2026-10-06');
    await saveCheckin(
      db,
      repos,
      plan,
      '2026-10-05',
      { 'hora-dormir': '23:00', 'hora-despertar': '06:30', 'calidad-sueno': 4 },
      '',
    );
    await saveCheckin(
      db,
      repos,
      plan,
      '2026-10-06',
      { 'hora-dormir': '00:00', 'hora-despertar': '07:00', 'calidad-sueno': 3 },
      '',
    );
    expect(await loadSleepSummary(repos, '2026-10-06')).toEqual({
      days: 2,
      avgDurationMin: 435,
      wakeRegularityMin: 30,
    });
  });
});
