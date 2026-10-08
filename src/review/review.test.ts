import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { Translate } from '../i18n';
import { loadDefaultTemplates } from '../templates/defaults';

import { loadReview } from './loadReview';
import { reviewLineText, weekRangeText } from './text';

let repos: Repositories;
let close: () => void;

// Sunday 2026-02-01 evening: the review covers Mon 2026-01-26 .. Sun 2026-02-01.
const SUNDAY = new Date(2026, 1, 1, 19, 0);

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db);
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  await repos.settings.set('anchors', { wake: '06:00', sleepTargetH: 8 });
  await repos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
  await repos.settings.set('startedOn', '2025-12-01');
  await repos.settings.set('onboardingComplete', true);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

async function session(date: string, hour: number) {
  const at = new Date(`${date}T0${hour}:00:00`).getTime();
  const id = await repos.workouts.createSession({
    programId: 'p',
    routineId: 'r',
    date,
    startedAt: at,
  });
  await repos.workouts.logSet({
    sessionId: id,
    stepId: 's',
    setIndex: 0,
    reps: 8,
    weightKg: 40,
    rir: 2,
    doneAt: at + 1,
  });
  await repos.workouts.finishSession(id, at + 3_600_000);
}

describe('loadReview', () => {
  it('summarizes the real data of the week and lists the pending suggestions', async () => {
    await session('2026-01-26', 6);
    await session('2026-01-28', 6);
    await repos.activity.upsert('2026-01-30', 'gym', 'notification');
    await session('2026-01-20', 6); // the week before: not counted
    for (const date of ['2026-01-26', '2026-01-27', '2026-01-28']) {
      await repos.habitLogs.set('agua', date, date === '2026-01-27' ? 3 : 10);
      await repos.checkins.upsert(date, 'morning', {
        'hora-dormir': '23:00',
        'hora-despertar': '06:30',
        'calidad-sueno': 4,
      });
      await repos.checkins.upsert(date, 'night', { energia: 4, animo: 5 });
    }
    await repos.suggestions.create({
      kind: 'sleepEarlier',
      payload: {
        variant: 'sleepEarlier',
        change: { type: 'bedtimeShift', fromMin: 0, toMin: -15 },
        params: { minutes: 15 },
        evidence: { days: 7 },
      },
      reason: 'suggestions.sleepEarlier.reason',
      createdAt: SUNDAY.getTime() - 1000,
    });

    const { review, suggestions } = await loadReview(repos, SUNDAY);
    expect(review.weekStart).toBe('2026-01-26');
    expect(review.training).toEqual({ done: 3, planned: 3 });
    expect(review.water).toEqual({ met: 2, days: 3 });
    expect(review.sleep).toEqual({ avgMin: 450, targetMin: 480, nights: 3 });
    expect(review.scales).toEqual({ quality: 4, energy: 4, mood: 5 });
    expect(review.letter.tone).toBe('full');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.payload.variant).toBe('sleepEarlier');
  });

  it('an empty week gives a brief letter and no figures', async () => {
    const { review, suggestions } = await loadReview(repos, SUNDAY);
    expect(review.letter.tone).toBe('brief');
    expect(review.summary.map((line) => line.key)).toEqual(['review.summary.trainingNone']);
    expect(suggestions).toEqual([]);
  });

  it('on Monday it still shows the week that just ended', async () => {
    await session('2026-01-26', 6);
    const { review } = await loadReview(repos, new Date(2026, 1, 2, 9, 0));
    expect(review.weekStart).toBe('2026-01-26');
    expect(review.training?.done).toBe(1);
  });
});

describe('weekly plan in the review', () => {
  const MONDAY = new Date(2026, 1, 2, 9, 0);

  it("counts the planned sessions from the reviewed week's override", async () => {
    const usual = (await loadReview(repos, MONDAY)).review.training;
    await session('2026-01-30', 6);
    await repos.settings.set('gymWeekPlans', { '2026-01-26': [{ weekday: 5, time: '07:00' }] });
    const planned = (await loadReview(repos, MONDAY)).review.training;
    expect(planned).toEqual({ done: 1, planned: 1 });
    expect(usual?.planned ?? 0).not.toBe(1);
  });

  it('plans next week on Sunday and the current week on Monday, prefilled from the usual plan', async () => {
    const sunday = await loadReview(repos, SUNDAY);
    expect(sunday.weekPlan.weekStart).toBe('2026-02-02');
    expect(sunday.weekPlan.override).toBeUndefined();
    expect(sunday.weekPlan.usual.length).toBeGreaterThan(0);
    // Before the 04:00 rollover Monday still belongs to Sunday: next week is still planned.
    expect((await loadReview(repos, new Date(2026, 1, 2, 2, 0))).weekPlan.weekStart).toBe(
      '2026-02-02',
    );
    expect((await loadReview(repos, MONDAY)).weekPlan.weekStart).toBe('2026-02-02');
  });
});

describe('loadReview on the last day of the review', () => {
  it('leaves out Sunday itself, which is still going', async () => {
    await session('2026-01-26', 6);
    await session('2026-02-01', 6); // Sunday, the day the review opens
    await repos.habitLogs.set('agua', '2026-02-01', 10);
    const sunday = await loadReview(repos, SUNDAY);
    expect(sunday.review.training?.done).toBe(1);
    expect(sunday.review.water).toBeNull();
    const monday = await loadReview(repos, new Date(2026, 1, 2, 9, 0));
    expect(monday.review.training?.done).toBe(2);
    expect(monday.review.water).toEqual({ met: 1, days: 1 });
  });

  it('only invites to sleep earlier while that suggestion can be offered', async () => {
    for (const date of ['2026-01-26', '2026-01-27', '2026-01-28']) {
      await repos.checkins.upsert(date, 'morning', {
        'hora-dormir': '00:30',
        'hora-despertar': '06:00',
        'calidad-sueno': 3,
      });
    }
    await session('2026-01-26', 6);
    await session('2026-01-28', 6);
    const invites = async () =>
      (await loadReview(repos, SUNDAY)).review.letter.lines.map((line) => line.key);
    expect(await invites()).toContain('review.letter.invite.sleep');
    await repos.suggestions.create({
      kind: 'sleepEarlier',
      payload: { nonsense: true },
      reason: 'x',
      createdAt: SUNDAY.getTime() - 1000,
    });
    expect(await invites()).not.toContain('review.letter.invite.sleep');
  });

  it('a steps goal changed during the week turns the comparison into an average', async () => {
    await repos.settings.set('startedOn', '2026-01-01');
    for (let d = 1; d <= 7; d += 1) {
      await repos.steps.upsert(`2026-01-0${d}`, 6000, 'manual'); // the baseline week
    }
    for (const date of ['2026-01-26', '2026-01-27', '2026-01-28']) {
      await repos.steps.upsert(date, 9000, 'manual');
    }
    const before = await loadReview(repos, SUNDAY);
    expect(before.review.steps?.kind).toBe('goal');
    await repos.settings.set('goals', { stepsGoal: 8000 });
    await repos.settings.set('goalsChangedOn', '2026-01-28');
    const changed = await loadReview(repos, SUNDAY);
    expect(changed.review.steps?.kind).toBe('average');
  });
});

describe('review texts', () => {
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

  it('formats durations, decimals and fills every placeholder in both languages', async () => {
    await session('2026-01-26', 6);
    for (const date of ['2026-01-26', '2026-01-27', '2026-01-28']) {
      await repos.checkins.upsert(date, 'morning', {
        'hora-dormir': '23:00',
        'hora-despertar': '06:30',
        'calidad-sueno': 4,
      });
      await repos.checkins.upsert(date, 'night', {
        energia: 4,
        animo: date === '2026-01-28' ? 3 : 4,
      });
    }
    const { review } = await loadReview(repos, SUNDAY);
    const lines = [...review.summary, ...review.letter.lines];
    for (const [language, messages] of [
      ['es', es],
      ['en', en],
    ] as const) {
      for (const line of lines) {
        expect(reviewLineText(line, translator(messages), language)).not.toMatch(/\{\{|review\./);
      }
    }
    const sleep = review.summary.find((line) => line.key === 'review.summary.sleep');
    if (!sleep) throw new Error('missing sleep line');
    expect(reviewLineText(sleep, translator(es), 'es')).toBe(
      'Dormiste en promedio 7 h 30 min (tu meta: 8 h)',
    );
    const energy = review.summary.find((line) => line.key === 'review.summary.energy');
    expect(energy && reviewLineText(energy, translator(es), 'es')).toBe(
      'Tu energía promedio fue 4 de 5',
    );
    const mood = review.summary.find((line) => line.key === 'review.summary.mood');
    expect(mood && reviewLineText(mood, translator(en), 'en')).toBe(
      'Your average mood was 3.7 out of 5',
    );
  });

  it('writes the week range with the active language', () => {
    expect(weekRangeText('2026-01-26', '2026-02-01', translator(en), 'en')).toMatch(/Jan.*Feb/);
  });
});
