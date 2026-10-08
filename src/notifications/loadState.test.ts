import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { buildUpcoming } from '../domain/notifications/buildUpcoming';
import { loadDefaultTemplates } from '../templates/defaults';

import { loadNotificationPlan } from './loadState';

let repos: Repositories;
let close: () => void;

const TODAY = '2026-10-05';
const MONDAY_MORNING = new Date(2026, 9, 5, 4, 30);

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db);
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  await repos.settings.set('anchors', defaults.settings.anchors ?? {});
  await repos.settings.set('gymDays', defaults.settings.gymDays ?? []);
  await repos.settings.set('onboardingComplete', true);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

describe('loadNotificationPlan: what is already done stops insisting', () => {
  it('a check habit logged today stops its reminders for today only', async () => {
    const before = await loadNotificationPlan(repos, TODAY);
    expect(before.state.today.doneAgendaIds).not.toContain('habit:movimiento:pausa-activa');
    const pending = buildUpcoming(before.state, MONDAY_MORNING).filter(
      (n) => n.data.habitId === 'pausa-activa',
    );
    expect(pending.some((n) => n.data.date === TODAY)).toBe(true);

    await repos.habitLogs.set('pausa-activa', TODAY, 1);
    const plan = await loadNotificationPlan(repos, TODAY);
    expect(plan.state.today.doneAgendaIds).toContain('habit:movimiento:pausa-activa');
    const after = buildUpcoming(plan.state, MONDAY_MORNING).filter(
      (n) => n.data.habitId === 'pausa-activa',
    );
    expect(after.some((n) => n.data.date === TODAY)).toBe(false);
    // Tomorrow's reminders are untouched.
    expect(after.some((n) => n.data.date === '2026-10-06')).toBe(true);
  });

  it('a check habit not completed (value 0) is not done', async () => {
    await repos.habitLogs.set('pausa-activa', TODAY, 0);
    const plan = await loadNotificationPlan(repos, TODAY);
    expect(plan.state.today.doneAgendaIds).not.toContain('habit:movimiento:pausa-activa');
  });

  it('the water goal reached still stops water reminders', async () => {
    await repos.habitLogs.set('agua', TODAY, 20);
    const plan = await loadNotificationPlan(repos, TODAY);
    expect(plan.state.today.doneAgendaIds).toContain('water:agua:agua');
  });

  it('reminders acknowledged or skipped from Hoy stop for today; another day is ignored', async () => {
    await repos.settings.set('todayState', {
      date: TODAY,
      skipped: ['habit:movimiento:caminar-comida'],
      acked: ['reminder:sueno:dormir'],
      snoozed: {},
    });
    const plan = await loadNotificationPlan(repos, TODAY);
    expect(plan.state.today.doneAgendaIds).toEqual(
      expect.arrayContaining(['habit:movimiento:caminar-comida', 'reminder:sueno:dormir']),
    );
    const other = await loadNotificationPlan(repos, '2026-10-06');
    expect(other.state.today.doneAgendaIds).not.toContain('reminder:sueno:dormir');
  });
});
