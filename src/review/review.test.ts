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
      createdAt: 1,
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
