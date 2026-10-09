import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { loadDefaultTemplates } from '../templates/defaults';
import { addGlassOfWater, checkinKindAt, loadQuickHabits, loadQuickMenu } from './quickAdd';

let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => 1_000);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
  await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
  await repos.settings.set('startedOn', '2026-10-01');
});

afterEach(() => close());

describe('addGlassOfWater', () => {
  it('adds one glass to today, on top of what is already logged', async () => {
    await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
    await repos.habitLogs.set('agua', '2026-10-06', 3);
    // 2026-10-06 is a rest day: target 8 glasses for 60 kg.
    expect(await addGlassOfWater(repos, '2026-10-06')).toEqual({
      status: 'added',
      value: 4,
      target: 8,
    });
    expect(await addGlassOfWater(repos, '2026-10-06')).toMatchObject({ value: 5 });
  });

  it('does nothing when there is no water habit', async () => {
    expect(await addGlassOfWater(repos, '2026-10-06')).toEqual({ status: 'noWater' });
  });
});

describe('checkinKindAt', () => {
  const none = { morning: false, night: false };
  it('opens the morning check-in before 15:00 and the night one after', () => {
    expect(checkinKindAt(7, none)).toBe('morning');
    expect(checkinKindAt(14, none)).toBe('morning');
    expect(checkinKindAt(15, none)).toBe('night');
    expect(checkinKindAt(23, none)).toBe('night');
  });

  it('offers the pending one when the one of the hour is done, and done when both are', () => {
    expect(checkinKindAt(20, { morning: false, night: true })).toBe('morning');
    expect(checkinKindAt(9, { morning: true, night: false })).toBe('night');
    expect(checkinKindAt(9, { morning: true, night: true })).toBe('done');
  });
});

describe('loadQuickMenu', () => {
  it('reads today’s check-ins and resolves today’s routine', async () => {
    await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
    await repos.checkins.upsert('2026-10-06', 'morning', {});
    const menu = await loadQuickMenu(repos, '2026-10-06');
    expect(menu.checkins).toEqual({ morning: true, night: false });
    expect(menu.gymRoutineId).toEqual(expect.any(String));
  });

  it('counts a check-in turned off in Ajustes as nothing to offer', async () => {
    await repos.settings.set('checkinPrefs', { morning: true, night: false, monthlyReviewDay: 1 });
    expect((await loadQuickMenu(repos, '2026-10-06')).checkins).toEqual({
      morning: false,
      night: true,
    });
  });

  it('has no routine without a program', async () => {
    expect((await loadQuickMenu(repos, '2026-10-06')).gymRoutineId).toBeNull();
  });
});

describe('loadQuickHabits', () => {
  it('lists today’s check habits with their state and the food note', async () => {
    await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
    const before = await loadQuickHabits(repos, '2026-10-06');
    expect(before.checks.length).toBeGreaterThan(0);
    const first = before.checks[0]!;
    expect(first.done).toBe(false);
    await repos.habitLogs.set(first.habitId, '2026-10-06', 1);
    await repos.foodNotes.save('2026-10-06', 'Ensalada');
    const after = await loadQuickHabits(repos, '2026-10-06');
    expect(after.checks.find((check) => check.habitId === first.habitId)?.done).toBe(true);
    expect(after.food?.note).toBe('Ensalada');
  });
});
