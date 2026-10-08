import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { isValidInsightEvidence } from '../backup/payloads';
import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { shiftDay } from '../domain/companion/sleepDebt';
import { generateSyntheticDays } from '../domain/testing/syntheticData';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { Translate } from '../i18n';
import { loadDefaultTemplates } from '../templates/defaults';

import { loadInsightData } from './loadData';
import { parseInsightRow } from './payload';
import { runWeeklyInsights } from './run';
import { insightTexts } from './text';

let db: Db;
let repos: Repositories;
let close: () => void;

// Saturday 2026-01-31 (the end of the synthetic series); its ISO week starts on Monday 01-26.
const NOW = new Date(2026, 0, 31, 10, 0);

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(db, () => NOW.getTime());
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await repos.settings.set('anchors', { wake: '06:00', sleepTargetH: 8 });
  await repos.settings.set('onboardingComplete', true);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
  await seed();
});

afterEach(() => close());

/** 60 deterministic days of check-ins, steps and activity answers (gym -> +35 min of sleep). */
async function seed() {
  for (const d of generateSyntheticDays({ days: 60, seed: 1 })) {
    await repos.checkins.upsert(d.date, 'morning', {
      'hora-dormir': d.morning.bed,
      'hora-despertar': d.morning.wake,
      'calidad-sueno': d.morning.quality,
    });
    await repos.checkins.upsert(d.date, 'night', { energia: d.night.energy, animo: d.night.mood });
    await repos.steps.upsert(d.date, d.steps, 'manual');
    await repos.activity.upsert(d.date, d.activity, 'manual');
  }
}

describe('runWeeklyInsights', () => {
  it('stores one unseen insight per week and marks the ISO week', async () => {
    const created = await runWeeklyInsights(db, repos, NOW);
    expect(created).toHaveLength(1);
    const rows = await repos.insights.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'sleepGym',
      text: 'insights.sleepGym.more',
      seenAt: null,
    });
    expect(await repos.settings.get('insightsLastRun')).toBe('2026-01-26');

    // Same week (Sunday): nothing new, even if more data arrived.
    expect(await runWeeklyInsights(db, repos, new Date(2026, 1, 1, 10))).toEqual([]);
    expect(await repos.insights.all()).toHaveLength(1);
  });

  it('never repeats the same kind within 4 weeks when the value did not change', async () => {
    await runWeeklyInsights(db, repos, NOW);
    // Next ISO week: the engine runs again, but sleepGym is blocked (same data, same value).
    await runWeeklyInsights(db, repos, new Date(2026, 1, 2, 10));
    const kinds = (await repos.insights.all()).map((row) => row.kind);
    expect(kinds.filter((kind) => kind === 'sleepGym')).toHaveLength(1);
    expect(kinds.length).toBeLessThanOrEqual(2);
  });

  it("respects the 04:00 day rollover: 02:00 on Monday still belongs to Sunday's week", async () => {
    await runWeeklyInsights(db, repos, new Date(2026, 1, 2, 2, 0));
    expect(await repos.settings.get('insightsLastRun')).toBe('2026-01-26');
    const [row] = await repos.insights.all();
    expect(row?.kind).toBe('sleepGym');
  });

  it('two concurrent runs store the insight once (the second sees the first one mark the week)', async () => {
    const runs = await Promise.all([
      runWeeklyInsights(db, repos, NOW),
      runWeeklyInsights(db, repos, NOW),
      runWeeklyInsights(db, repos, NOW),
    ]);
    expect(runs.map((ids) => ids.length).sort()).toEqual([0, 0, 1]);
    expect(await repos.insights.all()).toHaveLength(1);
  });

  it('does nothing before the onboarding is complete', async () => {
    await repos.settings.set('onboardingComplete', false);
    expect(await runWeeklyInsights(db, repos, NOW)).toEqual([]);
    expect(await repos.settings.get('insightsLastRun')).toBeUndefined();
  });

  it('without enough data it stores nothing and leaves the week unmarked', async () => {
    const test = await createTestDb();
    const fresh = createRepositories(test.db, () => NOW.getTime());
    await fresh.settings.set('onboardingComplete', true);
    expect(await runWeeklyInsights(test.db, fresh, NOW)).toEqual([]);
    expect(await fresh.settings.get('insightsLastRun')).toBeUndefined();
    test.close();
  });

  it('runs on the day the 21-day threshold is crossed, even mid-week', async () => {
    // The series starts on 2025-12-03: Monday 12-22 is its 20th day, Tuesday 12-23 the 21st.
    expect(await runWeeklyInsights(db, repos, new Date(2025, 11, 22, 10))).toEqual([]);
    expect(await repos.settings.get('insightsLastRun')).toBeUndefined();
    await runWeeklyInsights(db, repos, new Date(2025, 11, 23, 10));
    expect(await repos.settings.get('insightsLastRun')).toBe('2025-12-22');
  });

  it('a run that fails stores nothing and does not mark the week', async () => {
    const failing = {
      ...repos,
      settings: {
        ...repos.settings,
        set: async () => {
          throw new Error('disk full');
        },
      },
    } as Repositories;
    await expect(runWeeklyInsights(db, failing, NOW)).rejects.toThrow('disk full');
    expect(await repos.insights.all()).toEqual([]);
    expect(await repos.settings.get('insightsLastRun')).toBeUndefined();
  });
});

describe('loadInsightData', () => {
  const today = '2026-01-31';

  it('uses the default free days (Saturday and Sunday), the same as the rhythm code', async () => {
    expect((await loadInsightData(repos, today)).freeWeekdays).toEqual([6, 0]);
  });

  it('uses the free days from settings', async () => {
    await repos.settings.set('freeDays', [5, 6]);
    expect((await loadInsightData(repos, today)).freeWeekdays).toEqual([5, 6]);
  });

  it('counts as "no gym" only answered non-gym days and unplanned days without a session', async () => {
    await repos.settings.set('gymDays', [{ days: [1], anchor: 'gymMorning' }]);
    const data = await loadInsightData(repos, today);
    const noGym = new Set(data.noGymDates);
    const answers = new Map(
      generateSyntheticDays({ days: 60, seed: 1 }).map((d) => [d.date, d.activity]),
    );
    for (const [date, kind] of answers) {
      if (kind === 'gym') expect(noGym.has(date)).toBe(false);
      else expect(noGym.has(date)).toBe(true);
    }
    // Days with no answer: unplanned weekdays count, the planned Monday does not.
    expect(noGym.has('2025-11-06')).toBe(true); // Thursday, no data
    expect(noGym.has('2025-11-03')).toBe(false); // Monday, planned, no data
  });
});

describe('stored insights', () => {
  it('are read back as keys + params, marked seen once, and valid for the backup', async () => {
    await runWeeklyInsights(db, repos, NOW);
    const unseen = await repos.insights.latestUnseen();
    expect(unseen).toBeDefined();
    const parsed = parseInsightRow(unseen!);
    expect(parsed).toMatchObject({
      kind: 'sleepGym',
      textKey: 'insights.sleepGym.more',
      seen: false,
    });
    expect(parsed?.days).toBeGreaterThanOrEqual(21);
    expect(isValidInsightEvidence(unseen?.evidence)).toBe(true);

    expect(await repos.insights.markSeen(unseen!.id, NOW.getTime())).toBe(true);
    expect(await repos.insights.markSeen(unseen!.id, NOW.getTime())).toBe(false);
    expect(await repos.insights.latestUnseen()).toBeUndefined();
    const [row] = await repos.insights.createdBetween(0, NOW.getTime());
    expect(row?.seenAt).toBe(NOW.getTime());
  });

  it('an unreadable row is ignored, not shown', async () => {
    const id = await repos.insights.create({
      kind: 'sleepGym',
      text: 'insights.nope',
      evidence: { days: 3 },
      createdAt: NOW.getTime(),
    });
    const row = (await repos.insights.all()).find((r) => r.id === id);
    expect(parseInsightRow(row!)).toBeNull();
  });
});

describe('insight texts', () => {
  const translator =
    (messages: object): Translate =>
    (key, options) => {
      const text = key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          messages,
        );
      return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? `{{${name}}}`),
      );
    };
  const base = { id: 1, createdAt: 0, seen: false, days: 24 } as const;

  it('composes the prudent sentence with its params and "Basado en N días"', () => {
    const insight = {
      ...base,
      kind: 'sleepGym',
      textKey: 'insights.sleepGym.more',
      params: { minutes: 35 },
      value: 35,
    } as const;
    expect(insightTexts(insight, translator(es), 'es')).toEqual({
      text: 'Notamos que los días que entrenas duermes en promedio 35 minutos más.',
      evidence: 'Basado en 24 días',
    });
    expect(insightTexts(insight, translator(en), 'en').text).toMatch(/^We noticed that/);
  });

  it('formats decimals and thousands per language, and names the weekday', () => {
    const energy = {
      ...base,
      kind: 'energySleep',
      textKey: 'insights.energySleep.higher',
      params: { points: 0.8 },
      value: 0.8,
    } as const;
    expect(insightTexts(energy, translator(es), 'es').text).toContain('0,8 puntos');
    expect(insightTexts(energy, translator(en), 'en').text).toContain('0.8 points');
    const steps = {
      ...base,
      kind: 'stepsWeek',
      textKey: 'insights.stepsWeek.more',
      params: { steps: 1800 },
      value: 1800,
    } as const;
    expect(insightTexts(steps, translator(es), 'es').text).toMatch(/promedio 1\.?800 pasos más/);
    const weekday = {
      ...base,
      kind: 'bestWeekday',
      textKey: 'insights.bestWeekday.top',
      params: { weekday: 3, percent: 80, otherPercent: 60 },
      value: 3,
    } as const;
    expect(insightTexts(weekday, translator(es), 'es').text).toBe(
      'Notamos que, en estas semanas, los miércoles fueron tus días más activos: te moviste 80 % de esos días, frente a 60 % del resto.',
    );
    expect(insightTexts(weekday, translator(en), 'en').text).toContain(
      'Wednesdays were your most active days',
    );
  });

  it('no emitted string is left with a placeholder or a causal verb', () => {
    expect(shiftDay('2026-01-31', -1)).toBe('2026-01-30');
    for (const messages of [es.insights, en.insights]) {
      expect(JSON.stringify(messages)).not.toMatch(/racha|streak|te hace|makes you|because/i);
    }
  });
});
