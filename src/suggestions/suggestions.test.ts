import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { addDays, format, parseISO } from 'date-fns';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { Translate } from '../i18n';
import { expiryCutoff } from '../domain/suggestions/limits';
import { loadDefaultTemplates } from '../templates/defaults';

import { loadSuggestionData } from './loadData';
import { parsePayload, suggestionPayloadSchema, type SuggestionPayload } from './payload';
import { acceptSuggestion, rejectSuggestion, runDailySuggestions } from './run';
import { suggestionTexts } from './text';

let db: Db;
let repos: Repositories;
let close: () => void;
let clock = 0;

// Saturday 2026-01-31; its ISO week is Mon 01-26 .. Sun 02-01.
const NOW = new Date(2026, 0, 31, 10, 0);
const TODAY = '2026-01-31';
const day = (offset: number) => format(addDays(parseISO(TODAY), offset), 'yyyy-MM-dd');

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  clock = NOW.getTime();
  repos = createRepositories(db, () => clock);
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  await repos.settings.set('anchors', { wake: '06:00', sleepTargetH: 8 });
  await repos.settings.set('gymDays', []);
  await repos.settings.set('onboardingComplete', true);
  await repos.settings.set('startedOn', '2025-12-01');
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

/** Seven mornings of short sleep (6 h), all waking at 06:00. */
async function shortSleepWeek() {
  for (let offset = 0; offset < 7; offset += 1) {
    await repos.checkins.upsert(day(-offset), 'morning', {
      'hora-dormir': '00:00',
      'hora-despertar': '06:00',
      'calidad-sueno': 3,
    });
  }
}

const payload = (change: SuggestionPayload['change']): SuggestionPayload => ({
  variant: 'sleepEarlier',
  change,
  params: { minutes: 15 },
  evidence: { days: 7 },
});

async function store(change: SuggestionPayload['change']) {
  return repos.suggestions.create({
    kind: 'sleepEarlier',
    payload: payload(change),
    reason: 'suggestions.sleepEarlier.reason',
    createdAt: NOW.getTime(),
  });
}

describe('runDailySuggestions', () => {
  it('stores what the engine finds as pending, once per day', async () => {
    await shortSleepWeek();
    const created = await runDailySuggestions(db, repos, NOW);
    expect(created).toHaveLength(1);
    const pending = await repos.suggestions.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: 'sleepEarlier',
      status: 'pending',
      reason: 'suggestions.sleepEarlier.reason',
    });
    const stored = parsePayload(pending[0]?.payload);
    expect(stored?.change).toEqual({ type: 'bedtimeShift', fromMin: 0, toMin: -15 });
    expect(stored?.evidence.days).toBe(7);
    expect(await repos.settings.get('suggestionsLastRun')).toBe(TODAY);

    // Same day: nothing new, even if more data arrived.
    expect(await runDailySuggestions(db, repos, NOW)).toEqual([]);
    expect(await repos.suggestions.pending()).toHaveLength(1);
  });

  it('does nothing before the onboarding is complete', async () => {
    await shortSleepWeek();
    await repos.settings.set('onboardingComplete', false);
    expect(await runDailySuggestions(db, repos, NOW)).toEqual([]);
    expect(await repos.settings.get('suggestionsLastRun')).toBeUndefined();
  });

  it('never creates more than 2 per ISO week and never repeats a pending kind', async () => {
    await shortSleepWeek();
    // Gym planned on 3 weekdays and never attended: a second suggestion appears.
    await repos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
    await repos.settings.set('gymDaysChangedOn', '2025-12-01'); // the plan is old enough to judge
    expect(await runDailySuggestions(db, repos, NOW)).toHaveLength(2);
    // Tomorrow (Sunday, same ISO week) and the next Monday (new week, kinds still pending).
    expect(await runDailySuggestions(db, repos, new Date(2026, 1, 1, 10))).toEqual([]);
    expect(await runDailySuggestions(db, repos, new Date(2026, 1, 2, 10))).toEqual([]);
    expect(await repos.suggestions.pending()).toHaveLength(2);
  });

  it('does not offer a rejected kind again for four weeks (27 days blocked, 28 allowed)', async () => {
    const short = { 'hora-dormir': '00:00', 'hora-despertar': '06:00', 'calidad-sueno': 3 };
    for (let offset = -6; offset <= 28; offset += 1) {
      await repos.checkins.upsert(day(offset), 'morning', short);
    }
    const [id] = await runDailySuggestions(db, repos, NOW);
    expect(await rejectSuggestion(repos, id ?? 0, NOW)).toBe(true);
    expect(await rejectSuggestion(repos, id ?? 0, NOW)).toBe(false);

    const dayAt = (offset: number) => addDays(parseISO(TODAY), offset).getTime() + 10 * 3_600_000;
    expect(await runDailySuggestions(db, repos, new Date(dayAt(27)))).toEqual([]);
    const again = await runDailySuggestions(db, repos, new Date(dayAt(28)));
    expect(again).toHaveLength(1);
    expect((await repos.suggestions.pending())[0]?.kind).toBe('sleepEarlier');
  });
});

describe('acceptSuggestion', () => {
  it('applies a bedtime shift, marks it accepted and cannot be accepted twice', async () => {
    const id = await store({ type: 'bedtimeShift', fromMin: 0, toMin: -15 });
    const result = await acceptSuggestion(db, repos, id, NOW);
    expect(result.status).toBe('applied');
    expect(await repos.settings.get('planShifts')).toEqual({ bedMin: -15 });
    expect((await repos.suggestions.get(id))?.status).toBe('accepted');
    expect((await repos.suggestions.get(id))?.decidedAt).toBe(NOW.getTime());
    expect((await acceptSuggestion(db, repos, id, NOW)).status).toBe('unavailable');
  });

  it.each([
    [
      'water reminders earlier',
      { type: 'waterShift', fromMin: 0, toMin: -30 } as const,
      async () => expect(await repos.settings.get('planShifts')).toEqual({ waterMin: -30 }),
    ],
    [
      'a fixed wake time',
      { type: 'wakeTime', to: '05:10' } as const,
      async () =>
        expect(await repos.settings.get('anchors')).toEqual({ wake: '05:10', sleepTargetH: 8 }),
    ],
    [
      'a new steps goal',
      { type: 'stepsGoal', from: 7000, to: 7500 } as const,
      async () => expect(await repos.settings.get('goals')).toEqual({ stepsGoal: 7500 }),
    ],
    [
      'a moved gym day',
      { type: 'moveGymDay', fromDay: 3, toDay: 4 } as const,
      async () =>
        expect(await repos.settings.get('gymDays')).toEqual([
          { days: [1, 4, 5], anchor: 'gymMorning' },
        ]),
    ],
    [
      'a deload week',
      { type: 'deload', pct: 10, stepId: 'x' } as const,
      async () =>
        expect(await repos.settings.get('deloadWeek')).toEqual({
          startsOn: TODAY,
          endsOn: '2026-02-06',
          pct: 10,
        }),
    ],
  ])('applies %s through the repositories', async (_name, change, check) => {
    await repos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
    const id = await store(change);
    expect((await acceptSuggestion(db, repos, id, NOW)).status).toBe('applied');
    await check();
    expect((await repos.suggestions.get(id))?.status).toBe('accepted');
  });

  it('keeps accepted shifts together and never touches the plan when the row is unreadable', async () => {
    await acceptSuggestion(
      db,
      repos,
      await store({ type: 'bedtimeShift', fromMin: 0, toMin: -15 }),
      NOW,
    );
    await acceptSuggestion(
      db,
      repos,
      await store({ type: 'waterShift', fromMin: 0, toMin: -30 }),
      NOW,
    );
    expect(await repos.settings.get('planShifts')).toEqual({ bedMin: -15, waterMin: -30 });

    const broken = await repos.suggestions.create({
      kind: 'sleepEarlier',
      payload: { nonsense: true },
      reason: 'x',
      createdAt: 1,
    });
    expect((await acceptSuggestion(db, repos, broken, NOW)).status).toBe('unavailable');
    expect((await repos.suggestions.get(broken))?.status).toBe('pending');
    expect(await repos.settings.get('planShifts')).toEqual({ bedMin: -15, waterMin: -30 });
  });

  it('rolls everything back when a write fails (nothing half applied)', async () => {
    const id = await store({ type: 'wakeTime', to: '05:10' });
    const failing = {
      ...repos,
      suggestions: {
        ...repos.suggestions,
        decide: async () => {
          throw new Error('disk full');
        },
      },
    } as Repositories;
    await expect(acceptSuggestion(db, failing, id, NOW)).rejects.toThrow('disk full');
    expect(await repos.settings.get('anchors')).toEqual({ wake: '06:00', sleepTargetH: 8 });
    expect((await repos.suggestions.get(id))?.status).toBe('pending');
  });
});

describe('loadSuggestionData', () => {
  it('reads the water counter value at 18:00 from the write events', async () => {
    const at = (offset: number, hour: number) =>
      new Date(parseISO(day(offset)).getTime() + hour * 3_600_000).getTime();
    for (let offset = -1; offset >= -5; offset -= 1) {
      clock = at(offset, 10);
      await repos.habitLogs.increment('agua', day(offset));
      clock = at(offset, 15);
      await repos.habitLogs.increment('agua', day(offset));
      clock = at(offset, 19); // after 18:00: must not count
      await repos.habitLogs.increment('agua', day(offset), 6);
    }
    const data = await loadSuggestionData(repos, TODAY);
    expect(data.water).toHaveLength(5);
    // 60 kg, rest day: 8 glasses. Two glasses by 18:00 (the late six do not count).
    expect(data.water.every((entry) => entry.glassesAt18 === 2 && entry.targetGlasses >= 8)).toBe(
      true,
    );

    const created = await runDailySuggestions(db, repos, NOW);
    expect(created).toHaveLength(1);
    expect((await repos.suggestions.pending())[0]?.kind).toBe('waterEarlier');
  });

  it('collects morning sleep, gym attendance and the stalled lifts of the program', async () => {
    await shortSleepWeek();
    await repos.activity.upsert(day(-2), 'gym', 'notification');
    const data = await loadSuggestionData(repos, TODAY);
    expect(data.sleep).toHaveLength(7);
    expect(data.gymDates).toContain(day(-2));
    expect(data.rules).toEqual({ stallSessions: 3, deloadPct: 10 });
    expect(data.lifts.length).toBeGreaterThan(0);
    expect(data.deloadActive).toBe(false);
  });
});

describe('suggestion texts', () => {
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

  const samples: SuggestionPayload[] = [
    {
      variant: 'sleepEarlier',
      change: { type: 'bedtimeShift', fromMin: 0, toMin: -15 },
      params: { avg: '6 h 40 min', target: '8 h', minutes: 15 },
      evidence: { days: 7 },
    },
    {
      variant: 'wakeRegularity',
      change: { type: 'wakeTime', to: '05:10' },
      params: { time: '05:10', range: '1 h 30 min' },
      evidence: { days: 6 },
    },
    {
      variant: 'stepsRaise',
      change: { type: 'stepsGoal', from: 7000, to: 7500 },
      params: { met: 6, total: 7, goal: 7000, newGoal: 7500 },
      evidence: { days: 7 },
    },
    {
      variant: 'stepsLower',
      change: { type: 'stepsGoal', from: 7500, to: 7000 },
      params: { met: 1, total: 7, goal: 7500, newGoal: 7000 },
      evidence: { days: 7 },
    },
    {
      variant: 'waterEarlier',
      change: { type: 'waterShift', fromMin: 0, toMin: -30 },
      params: { short: 5, total: 7, minutes: 30 },
      evidence: { days: 7 },
    },
    {
      variant: 'waterEarlier',
      change: { type: 'waterShift', fromMin: 0, toMin: -30 },
      params: { short: 5, total: 7, minutes: 30, gapFrom: '14:00', gapTo: '17:00' },
      evidence: { days: 7 },
    },
    {
      variant: 'gymDay',
      change: { type: 'moveGymDay', fromDay: 4, toDay: 5 },
      params: { fromDay: 4, toDay: 5, missed: 3, weeks: 4 },
      evidence: { days: 28 },
    },
    {
      variant: 'deload',
      change: { type: 'deload', pct: 10, stepId: 'hip-thrust' },
      params: { exercise: 'Hip thrust', sessions: 3, pct: 10 },
      evidence: { days: 3 },
    },
  ];

  for (const [language, messages] of [
    ['es', es],
    ['en', en],
  ] as const) {
    it(`${language}: every variant fills all its placeholders`, () => {
      for (const sample of samples) {
        expect(suggestionPayloadSchema.safeParse(sample).success).toBe(true);
        const { text, reason, evidence } = suggestionTexts(sample, translator(messages), language);
        for (const line of [text, reason, evidence]) {
          expect(line).not.toMatch(/\{\{|suggestions\./);
          expect(line.length).toBeGreaterThan(5);
        }
      }
    });
  }

  it('writes the weekday names and a localized steps goal', () => {
    const gym = samples.find((sample) => sample.variant === 'gymDay');
    const steps = samples.find((sample) => sample.variant === 'stepsRaise');
    if (!gym || !steps) throw new Error('missing sample');
    expect(suggestionTexts(gym, translator(es), 'es').text).toBe(
      '¿Pasamos tu entrenamiento del jueves al viernes?',
    );
    expect(suggestionTexts(gym, translator(en), 'en').reason).toMatch(/^Thursdays got complicated/);
    const big = { ...steps, params: { ...steps.params, newGoal: 7500 } };
    expect(suggestionTexts(big, translator(en), 'en').text).toBe(
      'Shall we raise your goal to 7,500 steps?',
    );
  });

  it('does not talk about streaks, failure or guilt', () => {
    for (const messages of [es.suggestions, en.suggestions]) {
      expect(JSON.stringify(messages)).not.toMatch(
        /racha|streak|fall(aste|ed)|failed you|culpa|guilt/i,
      );
    }
  });
});

describe('review findings', () => {
  it('two concurrent runs store the suggestions once (the second sees the first one mark the day)', async () => {
    await shortSleepWeek();
    const runs = await Promise.all([
      runDailySuggestions(db, repos, NOW),
      runDailySuggestions(db, repos, NOW),
      runDailySuggestions(db, repos, NOW),
    ]);
    expect(runs.map((ids) => ids.length).sort()).toEqual([0, 0, 1]);
    expect(await repos.suggestions.all()).toHaveLength(1);
  });

  it('a run that fails stores nothing and does not mark the day', async () => {
    await shortSleepWeek();
    const failing = {
      ...repos,
      settings: {
        ...repos.settings,
        set: async () => {
          throw new Error('disk full');
        },
      },
    } as Repositories;
    await expect(runDailySuggestions(db, failing, NOW)).rejects.toThrow('disk full');
    expect(await repos.suggestions.all()).toEqual([]);
    expect(await repos.settings.get('suggestionsLastRun')).toBeUndefined();
  });

  it('pending suggestions expire after 7 days: hidden, removed by the next run, kind offered again', async () => {
    await shortSleepWeek();
    const [id] = await runDailySuggestions(db, repos, NOW);
    const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
    expect(await repos.suggestions.pending(expiryCutoff(later(6)))).toHaveLength(1);
    expect(await repos.suggestions.pending(expiryCutoff(later(8)))).toHaveLength(0);
    // Past the expiry the card cannot be accepted any more.
    expect((await acceptSuggestion(db, repos, id ?? 0, later(8))).status).toBe('unavailable');
    expect((await repos.suggestions.get(id ?? 0))?.status).toBe('pending');
    // The next run clears it and the kind is offered again with fresh data.
    for (let offset = 1; offset <= 8; offset += 1) {
      await repos.checkins.upsert(day(offset), 'morning', {
        'hora-dormir': '00:00',
        'hora-despertar': '06:00',
        'calidad-sueno': 3,
      });
    }
    const again = await runDailySuggestions(db, repos, later(8));
    expect(again).toHaveLength(1);
    expect(await repos.suggestions.get(id ?? 0)).toBeUndefined();
  });

  it('accepting re-validates against the CURRENT plan', async () => {
    const first = await store({ type: 'bedtimeShift', fromMin: 0, toMin: -15 });
    const second = await store({ type: 'bedtimeShift', fromMin: 0, toMin: -15 });
    expect((await acceptSuggestion(db, repos, first, NOW)).status).toBe('applied');
    // The second one started from 0 but the plan is at -15 now: stale, nothing is applied twice.
    expect((await acceptSuggestion(db, repos, second, NOW)).status).toBe('unavailable');
    expect(await repos.settings.get('planShifts')).toEqual({ bedMin: -15 });
    expect((await repos.suggestions.get(second))?.status).toBe('pending');

    await repos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
    const gone = await store({ type: 'moveGymDay', fromDay: 2, toDay: 4 }); // Tuesday is not planned
    expect((await acceptSuggestion(db, repos, gone, NOW)).status).toBe('unavailable');
    const same = await store({ type: 'wakeTime', to: '06:00' }); // already the plan
    expect((await acceptSuggestion(db, repos, same, NOW)).status).toBe('unavailable');
  });

  it('a steps goal edited after the suggestion was made makes it stale', async () => {
    clock = new Date(2026, 0, 29, 10).getTime();
    const id = await store({ type: 'stepsGoal', from: 7000, to: 7500 });
    await repos.suggestions.get(id);
    clock = NOW.getTime();
    await repos.settings.set('goals', { stepsGoal: 8000 });
    expect((await acceptSuggestion(db, repos, id, NOW)).status).toBe('unavailable');
  });

  it('a rejection of one gym day does not hide the other missed day', async () => {
    await repos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
    await repos.settings.set('gymDaysChangedOn', '2025-12-01');
    // Only Mondays were trained: Wednesday and Friday were missed 4 times each.
    for (let offset = 1; offset <= 28; offset += 1) {
      if (parseISO(day(-offset)).getDay() === 1) {
        await repos.activity.upsert(day(-offset), 'gym', 'manual');
      }
    }
    const [id] = await runDailySuggestions(db, repos, NOW);
    const first = parsePayload((await repos.suggestions.get(id ?? 0))?.payload);
    expect(first?.change).toMatchObject({ type: 'moveGymDay', fromDay: 3 });
    await rejectSuggestion(repos, id ?? 0, NOW);
    const monday = new Date(2026, 1, 2, 10);
    const [next] = await runDailySuggestions(db, repos, monday);
    const second = parsePayload((await repos.suggestions.get(next ?? 0))?.payload);
    expect(second?.change).toMatchObject({ type: 'moveGymDay', fromDay: 5 });
  });

  it('shows the unit of the evidence: sessions for a deload, days for the rest', () => {
    const t: Translate = (key, options) => {
      const text = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], es);
      return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? `{{${name}}}`),
      );
    };
    const base = {
      variant: 'deload' as const,
      change: { type: 'deload' as const, pct: 10, stepId: 'x' },
      params: { exercise: 'X', sessions: 3, pct: 10 },
    };
    expect(
      suggestionTexts({ ...base, evidence: { days: 3, unit: 'sessions' } }, t, 'es').evidence,
    ).toBe('Basado en 3 sesiones');
    expect(suggestionTexts({ ...base, evidence: { days: 7 } }, t, 'es').evidence).toBe(
      'Basado en 7 días',
    );
  });
});
