import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { loadDefaultTemplates } from '../templates/defaults';
import { loadHabitsData } from './habitsData';
import { buildHabitsView, nextWaterValue } from './habitsView';

let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => 1_000);
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
  // Monday and Wednesday are gym days.
  await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
  await repos.settings.set('startedOn', '2026-10-01');
});

afterEach(() => close());

// 2026-10-06 is a Tuesday (rest day), 2026-10-05 a Monday (gym day).
async function viewFor(today: string) {
  return buildHabitsView(await loadHabitsData(repos, today), today);
}

describe('habits view', () => {
  it('shows the water target for the day: 8 on a rest day, 10 on a gym day', async () => {
    expect((await viewFor('2026-10-06')).water?.target).toMatchObject({
      glasses: 8,
      gymDay: false,
    });
    expect((await viewFor('2026-10-05')).water?.target).toMatchObject({
      glasses: 10,
      gymDay: true,
    });
  });

  it("counts water consistency against each day's own target", async () => {
    await repos.habitLogs.set('agua', '2026-10-05', 9); // gym day needs 10: not done
    await repos.habitLogs.set('agua', '2026-10-04', 8); // Sunday rest day: done
    const view = await viewFor('2026-10-06');
    expect(view.water?.consistency?.done).toBe(1);
    expect(view.water?.consistency?.total).toBe(10);
  });

  it('lists the active break only for desk workers, plus the walk after eating', async () => {
    expect((await viewFor('2026-10-06')).checks.map((c) => c.habitId)).toEqual([
      'pausa-activa',
      'caminar-comida',
    ]);
    await repos.profile.save({ workType: 'activa' });
    expect((await viewFor('2026-10-06')).checks.map((c) => c.habitId)).toEqual(['caminar-comida']);
  });

  it('tracks a check, its consistency and the food note', async () => {
    await repos.habitLogs.set('caminar-comida', '2026-10-06', 1);
    await repos.habitLogs.set('caminar-comida', '2026-10-04', 1);
    await repos.foodNotes.save('2026-10-06', 'Ensalada');
    const view = await viewFor('2026-10-06');
    const walk = view.checks.find((c) => c.habitId === 'caminar-comida');
    expect(walk?.done).toBe(true);
    expect(walk?.consistency.done).toBe(2);
    expect(view.food).toMatchObject({
      note: 'Ensalada',
      prompt: '¿Qué comiste hoy y cómo te sentiste?',
    });
    expect(view.food?.consistency.done).toBe(1);
  });

  it('hides the food notes when that module is turned off', async () => {
    await repos.templates.setActive('habitos', false);
    // The bundle was split into modules: turning one off hides only its own habits / notes.
    await repos.templates.setActive('comida-notas', false);
    expect((await viewFor('2026-10-06')).food).toBeNull();
  });

  it('measures the baseline in week 1 and fixes the goal afterwards', async () => {
    await repos.settings.set('stepsEstimate', 4000);
    const week1 = await viewFor('2026-10-03');
    expect(week1.steps?.plan).toMatchObject({ phase: 'baseline', goal: 5000 });

    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      await repos.steps.upsert(date, 8000, 'manual');
    }
    await repos.steps.upsert('2026-10-08', 9000, 'manual');
    const after = await viewFor('2026-10-08');
    expect(after.steps?.plan).toMatchObject({ phase: 'active', baseline: 8000, goal: 9000 });
    expect(after.steps?.steps).toBe(9000);
    expect(after.steps?.consistency?.done).toBe(1);
  });

  it('reports which check-ins are on and done today, and the activity answer', async () => {
    await repos.settings.set('checkinPrefs', { morning: true, night: false, monthlyReviewDay: 1 });
    await repos.checkins.upsert('2026-10-06', 'morning', {});
    await repos.activity.upsert('2026-10-06', 'none', 'manual');
    const view = await viewFor('2026-10-06');
    expect(view.checkins).toEqual({
      morning: { enabled: true, done: true },
      night: { enabled: false, done: false },
    });
    expect(view.activityToday).toBe('none');
  });
});

describe('nextWaterValue', () => {
  it('fills up to the tapped drop and unfills the last filled one', () => {
    expect(nextWaterValue(2, 5)).toBe(5);
    expect(nextWaterValue(3, 3)).toBe(2);
    expect(nextWaterValue(1, 1)).toBe(0);
    expect(nextWaterValue(5, 2)).toBe(2);
  });
});

describe('activity and food note repositories', () => {
  it('keeps one activity answer per day (the later one replaces the earlier)', async () => {
    await repos.activity.upsert('2026-10-06', 'walk', 'notification');
    await repos.activity.upsert('2026-10-06', 'none', 'manual');
    expect(await repos.activity.get('2026-10-06')).toMatchObject({
      kind: 'none',
      source: 'manual',
      loggedAt: 1_000,
    });
    expect(await repos.activity.inRange('2026-10-01', '2026-10-31')).toHaveLength(1);
    await expect(repos.activity.upsert('2026-10-07', 'run' as 'gym', 'manual')).rejects.toThrow();
  });

  it('keeps one food note per day', async () => {
    await repos.foodNotes.save('2026-10-06', ' Pasta ');
    await repos.foodNotes.save('2026-10-06', 'Sopa');
    expect((await repos.foodNotes.inRange('2026-10-01', '2026-10-31')).map((n) => n.text)).toEqual([
      'Sopa',
    ]);
    await repos.foodNotes.save('2026-10-06', '');
    expect(await repos.foodNotes.forDate('2026-10-06')).toBeUndefined();
  });
});
