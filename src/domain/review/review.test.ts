import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { generateSyntheticDays } from '../testing/syntheticData';

import {
  LETTER_MAX_LINES,
  buildWeeklyReview,
  reviewWeekStart,
  type WeeklyReviewData,
} from './buildWeeklyReview';

// Week of Monday 2026-01-26 .. Sunday 2026-02-01.
const WEEK = '2026-01-26';
const day = (offset: number) => {
  const d = new Date(2026, 0, 26 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function lookup(messages: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

function data(overrides: Partial<WeeklyReviewData> = {}): WeeklyReviewData {
  return {
    gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' }],
    anchors: { wake: '06:00', sleepTargetH: 8 },
    gymDates: [],
    water: [],
    steps: [],
    stepsGoal: 7000,
    sleep: [],
    ratings: { quality: [], energy: [], mood: [] },
    ...overrides,
  };
}

const night = (offset: number, sleepMin: number) => {
  const wake = 6 * 60;
  const bed = (wake - sleepMin + 1440) % 1440;
  const clock = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { date: day(offset), bed: clock(bed), wake: clock(wake) };
};

describe('reviewWeekStart', () => {
  it('is the Monday of the week that ends on the Sunday of the review', () => {
    expect(reviewWeekStart('2026-02-01')).toBe(WEEK); // Sunday: the week ending today
    expect(reviewWeekStart('2026-02-02')).toBe(WEEK); // Monday: the week that just closed
    expect(reviewWeekStart('2026-02-07')).toBe(WEEK); // Saturday: still last week's review
    expect(reviewWeekStart('2026-02-08')).toBe('2026-02-02');
  });
});

describe('buildWeeklyReview numbers', () => {
  it('counts sessions against the planned weekdays and ignores days outside the week', () => {
    const review = buildWeeklyReview(data({ gymDates: [day(0), day(2), day(-3), day(8)] }), WEEK);
    expect(review.weekEnd).toBe('2026-02-01');
    expect(review.training).toEqual({ done: 2, planned: 3 });
    expect(review.summary[0]).toEqual({
      key: 'review.summary.training',
      params: { done: 2, planned: 3 },
    });
  });

  it('says it neutrally when there were no sessions or more than planned', () => {
    expect(buildWeeklyReview(data(), WEEK).summary[0]?.key).toBe('review.summary.trainingNone');
    const more = buildWeeklyReview(data({ gymDates: [day(0), day(1), day(2), day(3)] }), WEEK);
    expect(more.summary[0]?.key).toBe('review.summary.trainingMore');
    const noPlan = buildWeeklyReview(data({ gymDays: [], gymDates: [day(1)] }), WEEK);
    expect(noPlan.summary[0]?.key).toBe('review.summary.trainingUnplanned');
    expect(buildWeeklyReview(data({ gymDays: [] }), WEEK).training).toBeNull();
  });

  it('counts the water days that met their goal; days without a goal or a log are not compared', () => {
    const review = buildWeeklyReview(
      data({
        water: [
          { date: day(0), glasses: 8, targetGlasses: 8 },
          { date: day(1), glasses: 7, targetGlasses: 8 },
          { date: day(2), glasses: 10, targetGlasses: 10 },
          { date: day(3), glasses: 5, targetGlasses: null },
          { date: day(4), glasses: 0, targetGlasses: 8 },
        ],
      }),
      WEEK,
    );
    expect(review.water).toEqual({ met: 2, days: 3 });
    expect(review.summary).toContainEqual({ key: 'review.summary.water', params: { met: 2 } });
  });

  it('steps: counts the goal days, or averages while the goal is still being measured', () => {
    const rows = [6000, 7000, 8000, 0].map((steps, index) => ({ date: day(index), steps }));
    expect(buildWeeklyReview(data({ steps: rows }), WEEK).steps).toEqual({
      kind: 'goal',
      met: 2,
      days: 3,
    });
    expect(buildWeeklyReview(data({ steps: rows, stepsGoal: null }), WEEK).steps).toEqual({
      kind: 'average',
      average: 7000,
    });
    expect(buildWeeklyReview(data({ steps: [{ date: day(0), steps: 0 }] }), WEEK).steps).toBeNull();
  });

  it('sleep needs 3 nights; check-in scales need 3 values and are rounded to one decimal', () => {
    expect(
      buildWeeklyReview(data({ sleep: [night(0, 400), night(1, 400)] }), WEEK).sleep,
    ).toBeNull();
    const review = buildWeeklyReview(
      data({
        sleep: [night(0, 400), night(1, 440), night(2, 420)],
        ratings: {
          quality: [],
          energy: [4, 4, 3].map((value, index) => ({ date: day(index), value })),
          mood: [5, 4].map((value, index) => ({ date: day(index), value })),
        },
      }),
      WEEK,
    );
    expect(review.sleep).toEqual({ avgMin: 420, targetMin: 480, nights: 3 });
    expect(review.scales).toEqual({ quality: null, energy: 3.7, mood: null });
    expect(review.summary.map((entry) => entry.key)).toEqual([
      'review.summary.trainingNone',
      'review.summary.sleep',
      'review.summary.energy',
    ]);
  });

  it('counts the days of the week that have any record', () => {
    const review = buildWeeklyReview(
      data({
        gymDates: [day(0)],
        water: [{ date: day(0), glasses: 3, targetGlasses: 8 }],
        steps: [{ date: day(1), steps: 5000 }],
      }),
      WEEK,
    );
    expect(review.activeDays).toBe(2);
  });
});

describe('Carta de Pomi', () => {
  const rich = data({
    gymDates: [day(0), day(2), day(4)],
    water: [0, 1, 2, 3].map((offset) => ({ date: day(offset), glasses: 8, targetGlasses: 8 })),
    steps: [0, 1, 2].map((offset) => ({ date: day(offset), steps: 8000 })),
    sleep: [night(0, 400), night(1, 410), night(2, 420)],
    sleepEarlierAvailable: true,
  });

  it('only invites to sleep earlier when that suggestion could be offered', () => {
    const { letter } = buildWeeklyReview({ ...rich, sleepEarlierAvailable: false }, WEEK);
    expect(letter.lines.map((entry) => entry.key)).not.toContain('review.letter.invite.sleep');
    expect(letter.lines.at(-2)?.key).toMatch(/^review\.letter\.invite\.(one|two|three)$/);
    const missing = buildWeeklyReview({ ...rich, sleepEarlierAvailable: undefined }, WEEK);
    expect(missing.letter.lines.map((entry) => entry.key)).not.toContain(
      'review.letter.invite.sleep',
    );
  });

  it('is a short letter: hello, an achievement, one fact, an invitation and a goodbye', () => {
    const { letter } = buildWeeklyReview(rich, WEEK);
    expect(letter.tone).toBe('full');
    expect(letter.lines.length).toBeLessThanOrEqual(LETTER_MAX_LINES);
    expect(letter.lines.map((entry) => entry.key)).toEqual([
      'review.letter.hello',
      'review.letter.achievement.trainingAll',
      'review.letter.fact.sleep',
      'review.letter.invite.sleep', // slept 30+ min under the target
      'review.letter.bye',
    ]);
    expect(letter.lines[1]?.params).toEqual({ done: 3 });
    expect(letter.lines[2]?.params).toEqual({ avgMin: 410 });
  });

  it('picks the achievement by what happened, and falls back to simply being present', () => {
    const keyOf = (overrides: Partial<WeeklyReviewData>) =>
      buildWeeklyReview(data(overrides), WEEK).letter.lines[1]?.key;
    const water = [0, 1, 2].map((offset) => ({ date: day(offset), glasses: 8, targetGlasses: 8 }));
    expect(keyOf({ gymDates: [day(0)], water })).toBe('review.letter.achievement.training');
    expect(keyOf({ water })).toBe('review.letter.achievement.water');
    expect(keyOf({ steps: [0, 1, 2].map((offset) => ({ date: day(offset), steps: 9000 })) })).toBe(
      'review.letter.achievement.steps',
    );
    expect(keyOf({ steps: [0, 1, 2].map((offset) => ({ date: day(offset), steps: 100 })) })).toBe(
      'review.letter.achievement.present',
    );
  });

  it('with little data it is brief, warm and has no figures', () => {
    const review = buildWeeklyReview(
      data({ gymDates: [day(0)], water: [{ date: day(1), glasses: 2, targetGlasses: 8 }] }),
      WEEK,
    );
    expect(review.activeDays).toBe(2);
    expect(review.letter.tone).toBe('brief');
    expect(review.letter.lines.map((entry) => entry.key)).toContain('review.letter.brief');
    expect(review.letter.lines.every((entry) => Object.keys(entry.params).length === 0)).toBe(true);
    expect(buildWeeklyReview(data(), WEEK).letter.tone).toBe('brief');
  });

  it('rotates the invitation from week to week but is stable for a given week', () => {
    const invitation = (week: string) =>
      buildWeeklyReview(data(), week).letter.lines.find((entry) =>
        entry.key.startsWith('review.letter.invite.'),
      )?.key;
    expect(invitation(WEEK)).toBe(invitation(WEEK));
    const keys = new Set(
      ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'].map((week) => invitation(week)),
    );
    expect(keys.size).toBeGreaterThan(1);
  });

  it('every key it can produce exists in es and en, with no streaks or blame', () => {
    const reviews = [
      buildWeeklyReview(rich, WEEK),
      buildWeeklyReview(data(), WEEK),
      buildWeeklyReview(
        data({
          gymDates: [day(0), day(1), day(2), day(3)],
          steps: [0, 1, 2].map((offset) => ({ date: day(offset), steps: 100 })),
          stepsGoal: null,
          ratings: {
            quality: [3, 4, 5].map((value, index) => ({ date: day(index), value })),
            energy: [3, 4, 5].map((value, index) => ({ date: day(index), value })),
            mood: [3, 4, 5].map((value, index) => ({ date: day(index), value })),
          },
        }),
        WEEK,
      ),
    ];
    const keys = new Set(
      reviews.flatMap((review) => [...review.summary, ...review.letter.lines].map((e) => e.key)),
    );
    for (const key of keys) {
      for (const messages of [es, en]) {
        const text = lookup(messages, key);
        expect(typeof text).toBe('string');
        expect(String(text)).not.toMatch(/racha|streak|perdiste|fallaste|failed|lost/i);
      }
    }
    expect(JSON.stringify([es.review, en.review])).not.toMatch(/racha|streak/i);
  });

  it('works with 60 days of synthetic history', () => {
    const synthetic = generateSyntheticDays({ days: 60 });
    const last = synthetic.at(-1)?.date ?? '';
    const start = reviewWeekStart(last); // the synthetic series ends on a Saturday
    const review = buildWeeklyReview(
      data({
        gymDates: synthetic.filter((entry) => entry.gym).map((entry) => entry.date),
        steps: synthetic.map((entry) => ({ date: entry.date, steps: entry.steps })),
        sleep: synthetic.map((entry) => ({
          date: entry.date,
          bed: entry.morning.bed,
          wake: entry.morning.wake,
        })),
        ratings: {
          quality: synthetic.map((entry) => ({ date: entry.date, value: entry.morning.quality })),
          energy: synthetic.map((entry) => ({ date: entry.date, value: entry.night.energy })),
          mood: synthetic.map((entry) => ({ date: entry.date, value: entry.night.mood })),
        },
      }),
      start,
    );
    expect(review.weekStart).toBe('2026-01-19');
    expect(review.activeDays).toBe(7);
    expect(review.training?.planned).toBe(3);
    expect(review.sleep?.nights).toBe(7);
    expect(review.letter.tone).toBe('full');
    expect(review.letter.lines.length).toBeLessThanOrEqual(LETTER_MAX_LINES);
  });
});

describe('the last day of the review', () => {
  it('leaves out today, which is still going, from the counts and the planned sessions', () => {
    const sunday = day(6);
    const withToday = data({
      gymDays: [{ days: [1, 3, 5, 0], anchor: 'gymMorning' }],
      gymDates: [day(0), day(6)],
      water: [{ date: sunday, glasses: 8, targetGlasses: 8 }],
      steps: [{ date: sunday, steps: 9000 }],
    });
    const open = buildWeeklyReview(withToday, WEEK, sunday);
    expect(open.training).toEqual({ done: 1, planned: 3 }); // Sunday neither done nor planned
    expect(open.water).toBeNull();
    expect(open.steps).toBeNull();
    // Opened on Monday, the whole week is complete.
    const closed = buildWeeklyReview(withToday, WEEK, day(7));
    expect(closed.training).toEqual({ done: 2, planned: 4 });
    expect(closed.water).toEqual({ met: 1, days: 1 });
  });
});
