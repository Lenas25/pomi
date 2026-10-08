import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { sql } from 'drizzle-orm';

import { createBackup, restoreBackup } from '../backup/backup';
import { parseBackupText } from '../backup/parse';
import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { buildAgenda } from '../domain/agenda/buildAgenda';
import {
  effectiveGymPlan,
  gymDaysFromPlan,
  gymWeekStart,
  pruneGymWeekPlans,
} from '../domain/gym/gymPlan';
import { saveWeekPlan } from '../review/weekPlan';
import { buildUpcoming } from '../domain/notifications/buildUpcoming';
import { loadNotificationPlan } from '../notifications/loadState';
import { loadDefaultTemplates } from '../templates/defaults';

import { loadScheduleSettings, planForDays, saveGoals, saveGymPlan } from './schedule';

const MONDAY = '2026-10-05';
const MONDAY_EARLY = new Date(2026, 9, 5, 4, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

let db: Db;
let repos: Repositories;
let close: () => void;
let clock = new Date(2026, 9, 5, 12).getTime();

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  clock = new Date(2026, 9, 5, 12).getTime();
  repos = createRepositories(test.db, () => clock);
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  // Old store: two-slot model only (Mon/Wed morning, Tue/Thu evening).
  await repos.settings.set('anchors', defaults.settings.anchors ?? {});
  await repos.settings.set('gymDays', defaults.settings.gymDays ?? []);
  await repos.settings.set('onboardingComplete', true);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

describe('effectiveGymPlan', () => {
  it('migrates gymDays + anchors to a per-day plan (time = slot anchor)', () => {
    expect(
      effectiveGymPlan({
        gymDays: [
          { days: [3, 1], anchor: 'gymMorning' },
          { days: [2], anchor: 'gymEvening' },
        ],
        anchors: { gymMorning: '06:30', gymEvening: '19:00' },
      }),
    ).toEqual([
      { weekday: 1, time: '06:30' },
      { weekday: 2, time: '19:00' },
      { weekday: 3, time: '06:30' },
    ]);
  });

  it('keeps a morning AND evening day as two sessions, and a missing anchor as no time', () => {
    const gymDays = [
      { days: [1], anchor: 'gymMorning' as const },
      { days: [1, 2], anchor: 'gymEvening' as const },
    ];
    expect(effectiveGymPlan({ gymDays, anchors: { gymMorning: '06:00' } })).toEqual([
      { weekday: 1 },
      { weekday: 1, time: '06:00' },
      { weekday: 2 },
    ]);
    const plan = [
      { weekday: 1, time: '06:00' },
      { weekday: 1, time: '18:00' },
    ];
    expect(gymDaysFromPlan(plan)).toEqual([
      { days: [1], anchor: 'gymMorning' },
      { days: [1], anchor: 'gymEvening' },
    ]);
  });

  it('uses the stored per-day time and lets a moved day inherit the freed time', () => {
    const gymPlan = [
      { weekday: 1, time: '07:15' },
      { weekday: 3, time: '20:10' },
    ];
    expect(effectiveGymPlan({ gymPlan, gymDays: gymDaysFromPlan(gymPlan), anchors: {} })).toEqual(
      gymPlan,
    );
    // A suggestion moved Wednesday to Friday inside `gymDays` only.
    expect(
      effectiveGymPlan({
        gymPlan,
        gymDays: [
          { days: [1], anchor: 'gymMorning' },
          { days: [5], anchor: 'gymEvening' },
        ],
        anchors: {},
      }),
    ).toEqual([
      { weekday: 1, time: '07:15' },
      { weekday: 5, time: '20:10' },
    ]);
  });

  it('planForDays keeps existing times and gives new days the default', () => {
    const plan = [{ weekday: 1, time: '07:15' }];
    expect(planForDays(plan, [1, 4], {})).toEqual([
      { weekday: 1, time: '07:15' },
      { weekday: 4, time: '07:15' },
    ]);
    expect(planForDays([], [2], { gymEvening: '18:30' })).toEqual([{ weekday: 2, time: '18:30' }]);
  });
});

describe('per-day gym times reach the agenda and the notifications', () => {
  it('an old store keeps its slot times', async () => {
    const settings = await loadScheduleSettings(repos);
    expect(settings.plan.find((entry) => entry.weekday === 1)?.time).toBe('06:00');
    expect(settings.plan.find((entry) => entry.weekday === 2)?.time).toBe('18:00');
  });

  it('a saved per-day time moves the agenda item and the gym notification', async () => {
    await saveGymPlan(db, repos, [
      { weekday: 1, time: '07:15' },
      { weekday: 2, time: '19:40' },
    ]);
    expect(await repos.settings.get('gymDays')).toEqual([
      { days: [1], anchor: 'gymMorning' },
      { days: [2], anchor: 'gymEvening' },
    ]);
    const { state } = await loadNotificationPlan(repos, MONDAY);
    const gym = buildAgenda(new Date(2026, 9, 5), state).find((item) => item.id === 'gym');
    expect(gym?.occurrences).toEqual([7 * 60 + 15]);

    const gymIds = buildUpcoming(state, MONDAY_EARLY)
      .filter((notification) => notification.id.startsWith('gym:'))
      .map((notification) => notification.id);
    expect(gymIds.some((id) => id.endsWith(`${MONDAY}:07:15`))).toBe(true);
    expect(gymIds.some((id) => id.endsWith('2026-10-06:19:40'))).toBe(true);
    // Wednesday was dropped from the plan.
    expect(gymIds.some((id) => id.includes('2026-10-07'))).toBe(false);
  });
});

describe('week override (weekly review "Planifica tu semana")', () => {
  const NEXT_MONDAY = '2026-10-12';

  it('uses the ISO week Monday of a logical day', () => {
    expect(gymWeekStart('2026-10-11')).toBe(MONDAY); // Sunday closes the week
    expect(gymWeekStart(MONDAY)).toBe(MONDAY);
    expect(gymWeekStart('2026-10-08')).toBe(MONDAY);
  });

  it('applies only to its week, then reverts to the usual plan', () => {
    const settings = {
      gymPlan: [{ weekday: 1, time: '07:00' }],
      gymDays: [{ days: [1], anchor: 'gymMorning' as const }],
      gymWeekPlans: { [MONDAY]: [{ weekday: 3, time: '19:00' }] },
    };
    expect(effectiveGymPlan(settings, '2026-10-07')).toEqual([{ weekday: 3, time: '19:00' }]);
    expect(effectiveGymPlan(settings, '2026-10-11')).toEqual([{ weekday: 3, time: '19:00' }]);
    expect(effectiveGymPlan(settings, NEXT_MONDAY)).toEqual([{ weekday: 1, time: '07:00' }]);
    expect(effectiveGymPlan(settings, '2026-10-04')).toEqual([{ weekday: 1, time: '07:00' }]);
    expect(effectiveGymPlan(settings)).toEqual([{ weekday: 1, time: '07:00' }]);
  });

  it('moves the agenda item and the notifications for that week only', async () => {
    await saveGymPlan(db, repos, [
      { weekday: 1, time: '07:15' },
      { weekday: 2, time: '19:40' },
    ]);
    await saveWeekPlan(repos, MONDAY, [{ weekday: 2, time: '08:30' }], MONDAY);
    const { state } = await loadNotificationPlan(repos, MONDAY);
    // Monday is planned off this week; Tuesday moves to 08:30.
    expect(buildAgenda(new Date(2026, 9, 5), state).some((item) => item.id === 'gym')).toBe(false);
    const tuesday = buildAgenda(new Date(2026, 9, 6), state).find((item) => item.id === 'gym');
    expect(tuesday?.occurrences).toEqual([8 * 60 + 30]);
    // Next Monday the usual plan is back.
    const next = buildAgenda(new Date(2026, 9, 12), state).find((item) => item.id === 'gym');
    expect(next?.occurrences).toEqual([7 * 60 + 15]);

    const gymIds = buildUpcoming(state, MONDAY_EARLY)
      .filter((notification) => notification.id.startsWith('gym:'))
      .map((notification) => notification.id);
    expect(gymIds.some((id) => id.endsWith('2026-10-06:08:30'))).toBe(true);
    expect(gymIds.some((id) => id.includes(MONDAY))).toBe(false);
    expect(gymIds.some((id) => id.endsWith('2026-10-06:19:40'))).toBe(false);
    // The usual plan and its stamp are untouched by an override.
    expect((await loadScheduleSettings(repos)).plan).toEqual([
      { weekday: 1, time: '07:15' },
      { weekday: 2, time: '19:40' },
    ]);
  });

  it('"Igual que siempre" removes the override; old weeks are pruned on write', async () => {
    await repos.settings.set('gymWeekPlans', {
      '2026-07-06': [{ weekday: 1, time: '07:00' }],
      '2026-08-10': [],
      [MONDAY]: [{ weekday: 2, time: '08:30' }],
    });
    await saveWeekPlan(repos, NEXT_MONDAY, [{ weekday: 4, time: '18:00' }], MONDAY);
    expect(await repos.settings.get('gymWeekPlans')).toEqual({
      '2026-08-10': [],
      [MONDAY]: [{ weekday: 2, time: '08:30' }],
      [NEXT_MONDAY]: [{ weekday: 4, time: '18:00' }],
    });
    await saveWeekPlan(repos, MONDAY, null, MONDAY);
    expect(Object.keys((await repos.settings.get('gymWeekPlans')) ?? {})).toEqual([
      '2026-08-10',
      NEXT_MONDAY,
    ]);
    expect(pruneGymWeekPlans({ '2026-08-09': [], '2026-08-10': [] }, MONDAY)).toEqual({
      '2026-08-10': [],
    });
  });

  it('rejects an invalid stored override instead of using it', async () => {
    await db.run(
      sql`insert into settings (key, value) values ('gymWeekPlans', '{"next week":[{"weekday":9,"time":"7"}]}')`,
    );
    expect(await repos.settings.get('gymWeekPlans')).toBeUndefined();
  });

  it('a backup carries the week overrides', async () => {
    await saveWeekPlan(repos, MONDAY, [{ weekday: 5, time: '10:45' }], MONDAY);
    const backup = await createBackup(db, { appVersion: '1.0.0' });
    const target = await createTestDb();
    try {
      const parsed = parseBackupText(JSON.stringify(backup));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      await restoreBackup(target.db, parsed.backup);
      expect(await createRepositories(target.db).settings.get('gymWeekPlans')).toEqual({
        [MONDAY]: [{ weekday: 5, time: '10:45' }],
      });
    } finally {
      target.close();
    }
  });
});

describe('stamps', () => {
  it('only a different weekday set stamps gymDaysChangedOn (time-only edits do not)', async () => {
    await saveGymPlan(db, repos, [{ weekday: 1, time: '07:15' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe(MONDAY);
    clock += 2 * DAY_MS;
    await saveGymPlan(db, repos, [{ weekday: 1, time: '07:15' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe(MONDAY);
    await saveGymPlan(db, repos, [{ weekday: 1, time: '19:30' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe(MONDAY);
    await saveGymPlan(db, repos, [{ weekday: 2, time: '19:30' }]);
    expect(await repos.settings.get('gymDaysChangedOn')).toBe('2026-10-07');
  });

  it('saveGymPlan writes gymPlan and gymDays in one transaction', async () => {
    await saveGymPlan(db, repos, [
      { weekday: 3, time: '07:00' },
      { weekday: 3, time: '09:00' },
    ]);
    expect(await repos.settings.get('gymPlan')).toEqual([
      { weekday: 3, time: '07:00' },
      { weekday: 3, time: '09:00' },
    ]);
    // Two morning sessions on Wednesday project to BOTH slots, so gymDays counts two sessions.
    expect(await repos.settings.get('gymDays')).toEqual([
      { days: [3], anchor: 'gymMorning' },
      { days: [3], anchor: 'gymEvening' },
    ]);
  });

  it('a changed steps goal stamps goalsChangedOn', async () => {
    await saveGoals(repos, { stepsGoal: 8000 });
    expect(await repos.settings.get('goalsChangedOn')).toBe(MONDAY);
    expect(await repos.settings.get('goals')).toEqual({ stepsGoal: 8000 });
  });

  it('a changed water goal stamps waterGoalChangedOn, never the steps stamp', async () => {
    await saveGoals(repos, { waterGlassesRest: 9 });
    expect(await repos.settings.get('waterGoalChangedOn')).toBe(MONDAY);
    expect(await repos.settings.get('goalsChangedOn')).toBeUndefined();
    clock += 2 * DAY_MS;
    await saveGoals(repos, { waterGlassesRest: 9 });
    expect(await repos.settings.get('waterGoalChangedOn')).toBe(MONDAY);
    await saveGoals(repos, { waterGlassesGym: 12 });
    expect(await repos.settings.get('waterGoalChangedOn')).toBe('2026-10-07');
    expect(await repos.settings.get('goalsChangedOn')).toBeUndefined();
  });
});

describe('backups', () => {
  it('an old backup without gymPlan restores and migrates on read', async () => {
    const original = await createBackup(db, { appVersion: '1.0.0' });
    expect(original.data.settings.some((row) => row.key === 'gymPlan')).toBe(false);
    const target = await createTestDb();
    try {
      const parsed = parseBackupText(JSON.stringify(original));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      await restoreBackup(target.db, parsed.backup);
      const restored = await loadScheduleSettings(createRepositories(target.db));
      expect(restored.plan).toEqual([
        { weekday: 1, time: '06:00' },
        { weekday: 2, time: '18:00' },
        { weekday: 3, time: '06:00' },
        { weekday: 4, time: '18:00' },
      ]);
    } finally {
      target.close();
    }
  });

  it('a new backup carries the per-day plan', async () => {
    const plan = [{ weekday: 5, time: '10:45' }];
    await saveGymPlan(db, repos, plan);
    const backup = await createBackup(db, { appVersion: '1.0.0' });
    const target = await createTestDb();
    try {
      const parsed = parseBackupText(JSON.stringify(backup));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      await restoreBackup(target.db, parsed.backup);
      expect((await loadScheduleSettings(createRepositories(target.db))).plan).toEqual(plan);
    } finally {
      target.close();
    }
  });
});
