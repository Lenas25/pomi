import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import type { CheckinQuestion, GymDays } from '../../templates/schema';
import { summarizeSleep } from '../formulas/sleep';
import { ACTIVITY_KINDS, activityReplyKey, countsAsMovement } from './activity';
import {
  adjustClock,
  initialAnswers,
  toMorningCheckin,
  validateAnswers,
  MAX_NOTE_LENGTH,
} from './checkins';
import { consistency, doneDates } from './consistency';
import { stepsPlan } from './stepsPlan';
import { gymSessionsOn, waterTargetFor } from './waterTarget';

describe('consistency', () => {
  it('counts the last 10 days and never behaves like a streak', () => {
    // Today is 2026-10-12 and still pending: the window is 10-02 .. 10-11.
    const result = consistency('2026-10-12', [
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
      '2026-10-11',
    ]);
    expect(result.total).toBe(10);
    expect(result.done).toBe(4);
    expect(result.days[0]?.date).toBe('2026-10-02');
    expect(result.days.at(-1)?.date).toBe('2026-10-11');
    // A gap in the middle changes nothing else: there is no "run" to break.
    expect(result.days.map((day) => day.done)).toEqual([
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('includes today once it is done', () => {
    const result = consistency('2026-10-12', ['2026-10-12', '2026-10-11']);
    expect(result.days.at(-1)).toEqual({ date: '2026-10-12', done: true });
    expect(result.days[0]?.date).toBe('2026-10-03');
    expect(result.done).toBe(2);
  });

  it('is zero with no history and crosses month boundaries', () => {
    const result = consistency('2026-11-03', []);
    expect(result.done).toBe(0);
    expect(result.days[0]?.date).toBe('2026-10-24');
  });
});

describe('doneDates', () => {
  it('compares each day with ITS target (gym days need more water)', () => {
    const entries = [
      { date: '2026-10-05', value: 8 }, // Monday: gym day, target 10 -> not done
      { date: '2026-10-06', value: 8 }, // Tuesday: rest day, target 8 -> done
      { date: '2026-10-07', value: 0 },
    ];
    const target = (date: string) => (date === '2026-10-05' ? 10 : 8);
    expect(doneDates(entries, target)).toEqual(['2026-10-06']);
  });

  it('treats a missing target as "any positive value" (checks)', () => {
    expect(
      doneDates(
        [
          { date: 'a', value: 1 },
          { date: 'b', value: 0 },
        ],
        () => null,
      ),
    ).toEqual(['a']);
  });
});

describe('waterTargetFor', () => {
  const gymDays: GymDays = [{ days: [1, 3], anchor: 'gymMorning' }]; // Mon, Wed

  it('adds 500 ml for a gym day and rounds up to glasses (60 kg: 8 -> 10)', () => {
    expect(waterTargetFor('2026-10-06', { weightKg: 60, gymDays })).toMatchObject({
      glasses: 8,
      ml: 2000,
      gymDay: false,
    }); // Tuesday
    expect(waterTargetFor('2026-10-05', { weightKg: 60, gymDays })).toMatchObject({
      glasses: 10,
      ml: 2500,
      gymDay: true,
    }); // Monday
  });

  it('counts two sessions on the same weekday', () => {
    const twice: GymDays = [
      { days: [1], anchor: 'gymMorning' },
      { days: [1], anchor: 'gymEvening' },
    ];
    expect(gymSessionsOn('2026-10-05', twice)).toBe(2);
    expect(waterTargetFor('2026-10-05', { weightKg: 60, gymDays: twice })?.glasses).toBe(12);
  });

  it('prefers the accepted goals and works without a weight', () => {
    const goals = { waterGlassesRest: 9, waterGlassesGym: 11 };
    expect(waterTargetFor('2026-10-06', { gymDays, goals })?.glasses).toBe(9);
    expect(waterTargetFor('2026-10-05', { gymDays, goals })?.glasses).toBe(11);
    expect(waterTargetFor('2026-10-06', { gymDays })).toBeNull();
  });

  it('honours a custom glass size', () => {
    expect(waterTargetFor('2026-10-06', { weightKg: 60, gymDays, glassMl: 500 })).toMatchObject({
      glasses: 4,
      ml: 2000,
    });
  });
});

describe('stepsPlan', () => {
  const history = [
    { date: '2026-10-01', steps: 6000 },
    { date: '2026-10-02', steps: 7000 },
    { date: '2026-10-03', steps: 5000 },
    { date: '2026-10-04', steps: 6000 },
    { date: '2026-10-20', steps: 12000 }, // after the baseline week: never part of the baseline
  ];

  it('measures during week 1 and shows a provisional goal from the estimate', () => {
    const plan = stepsPlan({
      today: '2026-10-02',
      startedOn: '2026-10-01',
      history: [],
      estimate: 4000,
    });
    expect(plan).toMatchObject({
      phase: 'baseline',
      baselineDaysLeft: 6,
      baseline: 4000,
      goal: 5000,
    });
  });

  it('fixes the goal from the first 7 days once the week is over', () => {
    const plan = stepsPlan({
      today: '2026-10-08',
      startedOn: '2026-10-01',
      history,
      estimate: 4000,
    });
    // Mean of 6000, 7000, 5000, 6000 = 6000 -> +1000 -> 7000.
    expect(plan).toMatchObject({
      phase: 'active',
      baselineDaysLeft: 0,
      baseline: 6000,
      goal: 7000,
    });
    // Later data does not move it.
    expect(
      stepsPlan({ today: '2026-10-25', startedOn: '2026-10-01', history, estimate: 4000 }).goal,
    ).toBe(7000);
  });

  it('uses the estimate when there is not enough data and nothing when there is neither', () => {
    const sparse = [{ date: '2026-10-01', steps: 9000 }];
    expect(
      stepsPlan({ today: '2026-10-09', startedOn: '2026-10-01', history: sparse, estimate: 4000 })
        .baseline,
    ).toBe(4000);
    expect(
      stepsPlan({ today: '2026-10-02', startedOn: '2026-10-01', history: [] }).goal,
    ).toBeNull();
  });

  it('lets an edited goal win and treats a missing start as day 0', () => {
    expect(
      stepsPlan({ today: '2026-10-09', startedOn: '2026-10-01', history, editedGoal: 8500 }).goal,
    ).toBe(8500);
    expect(stepsPlan({ today: '2026-10-09', history: [] }).phase).toBe('baseline');
  });

  it('ignores baseline days with no data instead of treating them as zero', () => {
    const withGaps = [
      { date: '2026-10-01', steps: 6000 },
      { date: '2026-10-02', steps: 0 },
      { date: '2026-10-03', steps: 8000 },
      { date: '2026-10-04', steps: 0 },
      { date: '2026-10-05', steps: 7000 },
    ];
    const plan = stepsPlan({ today: '2026-10-09', startedOn: '2026-10-01', history: withGaps });
    expect(plan.baseline).toBe(7000); // mean of 6000, 8000, 7000
    // Too few real days: the estimate wins, the zeros do not drag it down.
    const thin = [
      { date: '2026-10-01', steps: 6000 },
      { date: '2026-10-02', steps: 0 },
      { date: '2026-10-03', steps: 0 },
    ];
    expect(
      stepsPlan({ today: '2026-10-09', startedOn: '2026-10-01', history: thin, estimate: 4000 })
        .baseline,
    ).toBe(4000);
  });

  it('caps the goal', () => {
    const big = [1, 2, 3].map((day) => ({ date: `2026-10-0${day}`, steps: 14000 }));
    expect(stepsPlan({ today: '2026-10-09', startedOn: '2026-10-01', history: big }).goal).toBe(
      10000,
    );
  });
});

describe('check-in answers', () => {
  const morning: CheckinQuestion[] = [
    { id: 'hora-dormir', type: 'time', label: 'bed', prefill: 'bed' },
    { id: 'hora-despertar', type: 'time', label: 'wake', prefill: 'wake' },
    { id: 'calidad-sueno', type: 'scale', label: 'quality', scale: [1, 5] },
  ];
  const night: CheckinQuestion[] = [
    { id: 'energia', type: 'scale', label: 'energy', scale: [1, 5] },
    { id: 'nota', type: 'text', label: 'note', optional: true },
  ];

  it('prefills times from the plan and keeps saved answers', () => {
    expect(initialAnswers(morning, { bed: '22:30', wake: '06:00' })).toEqual({
      'hora-dormir': '22:30',
      'hora-despertar': '06:00',
    });
    expect(
      initialAnswers(morning, { bed: '22:30' }, { 'hora-dormir': '23:15', 'calidad-sueno': 4 }),
    ).toEqual({
      'hora-dormir': '23:15',
      'calidad-sueno': 4,
    });
  });

  it('adjusts a clock by 15 minutes across midnight', () => {
    expect(adjustClock('23:50', 15)).toBe('00:05');
    expect(adjustClock('00:05', -15)).toBe('23:50');
  });

  it('requires non-optional answers and bounds the scale', () => {
    expect(validateAnswers(morning, { 'hora-dormir': '22:30', 'hora-despertar': '06:00' })).toEqual(
      {
        ok: false,
        missing: ['calidad-sueno'],
        invalid: [],
      },
    );
    expect(
      validateAnswers(morning, {
        'hora-dormir': '22:30',
        'hora-despertar': '6:00',
        'calidad-sueno': 6,
      }),
    ).toEqual({ ok: false, missing: [], invalid: ['hora-despertar', 'calidad-sueno'] });
    expect(
      validateAnswers(morning, {
        'hora-dormir': '22:30',
        'hora-despertar': '06:00',
        'calidad-sueno': 4,
        extra: 'x',
      }),
    ).toEqual({
      ok: true,
      answers: { 'hora-dormir': '22:30', 'hora-despertar': '06:00', 'calidad-sueno': 4 },
    });
  });

  it('keeps optional notes trimmed and bounded, and omits empty ones', () => {
    const result = validateAnswers(night, { energia: 3, nota: `  ${'a'.repeat(400)}  ` });
    expect(result.ok && typeof result.answers.nota === 'string' && result.answers.nota.length).toBe(
      MAX_NOTE_LENGTH,
    );
    expect(validateAnswers(night, { energia: 3, nota: '   ' })).toEqual({
      ok: true,
      answers: { energia: 3 },
    });
  });

  it('maps morning answers to sleep stats (duration crosses midnight)', () => {
    const rows = [
      { date: '2026-10-05', answers: { 'hora-dormir': '23:00', 'hora-despertar': '06:30' } },
      { date: '2026-10-06', answers: { 'hora-dormir': '23:30', 'hora-despertar': '06:30' } },
      { date: '2026-10-07', answers: { 'calidad-sueno': 3 } },
    ].flatMap((row) => toMorningCheckin(row.date, morning, row.answers) ?? []);
    expect(rows).toHaveLength(2);
    expect(summarizeSleep(rows)).toEqual({ days: 2, avgDurationMin: 435, wakeRegularityMin: 0 });
  });
});

describe('activity', () => {
  it('has a reply key for every answer, present in both languages', () => {
    for (const kind of ACTIVITY_KINDS) {
      const key = activityReplyKey(kind).replace('activity.reply.', '');
      expect(es.activity.reply[key as keyof typeof es.activity.reply]).toBeTruthy();
      expect(en.activity.reply[key as keyof typeof en.activity.reply]).toBeTruthy();
    }
    expect(es.activity.reply.none).toBe('Pasa. Mañana seguimos');
  });

  it('never counts "Hoy no" as movement or as a failure', () => {
    expect(countsAsMovement('none')).toBe(false);
    expect(countsAsMovement('gym')).toBe(true);
    expect(countsAsMovement('walk')).toBe(true);
  });
});
