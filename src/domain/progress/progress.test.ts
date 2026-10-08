import { describe, expect, it } from '@jest/globals';

import {
  epley1RM,
  exercisesWithStrength,
  MAX_E1RM_REPS,
  strengthSeries,
  summarizeSeries,
  type SessionSets,
} from './strength';
import { hasWeeklyData, plannedPerWeek, weeklyBuckets } from './weekly';
import { isEntryDue, latestEntry, parseMetricInput } from './metrics';
import { dayKeyFor } from '../time';

describe('epley1RM', () => {
  it('estimates weight x (1 + reps / 30), a single rep being the weight itself', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 10)).toBe(133.3);
    expect(epley1RM(40, 8)).toBe(50.7);
    expect(epley1RM(42.5, 5)).toBe(49.6);
  });

  it('ignores sets that cannot be estimated', () => {
    expect(epley1RM(null, 8)).toBeNull();
    expect(epley1RM(40, null)).toBeNull();
    expect(epley1RM(0, 8)).toBeNull();
    expect(epley1RM(40, 0)).toBeNull();
    expect(epley1RM(40, 2.5)).toBeNull();
    expect(epley1RM(40, MAX_E1RM_REPS + 1)).toBeNull();
    expect(epley1RM(40, MAX_E1RM_REPS)).toBe(56);
  });
});

const set = (stepId: string, weightKg: number | null, reps: number | null) => ({
  stepId,
  weightKg,
  reps,
});

describe('strengthSeries', () => {
  const sessions: SessionSets[] = [
    { date: '2026-09-07', sets: [set('hip', 40, 8), set('hip', 40, 10), set('sq', 60, 5)] },
    { date: '2026-09-14', sets: [set('hip', 45, 8), set('hip', 30, 15)] },
    { date: '2026-09-14', sets: [set('hip', 50, 6)] },
    { date: '2026-09-21', sets: [set('plank', null, null), set('hip', null, 10)] },
  ];

  it('takes the best e1RM per day, merging sessions of the same day, sorted by date', () => {
    expect(strengthSeries(sessions, 'hip')).toEqual([
      { date: '2026-09-07', e1rm: 53.3, topWeightKg: 40 },
      { date: '2026-09-14', e1rm: 60, topWeightKg: 50 },
    ]);
  });

  it('returns nothing for an unknown step, bodyweight sets and sparse data', () => {
    expect(strengthSeries(sessions, 'nope')).toEqual([]);
    expect(strengthSeries(sessions, 'plank')).toEqual([]);
    expect(strengthSeries([], 'hip')).toEqual([]);
  });

  it('lists the exercises that have data, the one with most days first', () => {
    expect(exercisesWithStrength(sessions)).toEqual(['hip', 'sq']);
    expect(exercisesWithStrength([])).toEqual([]);
  });
});

describe('summarizeSeries', () => {
  it('describes from, to and the span in days', () => {
    expect(
      summarizeSeries([
        { date: '2026-08-10', value: 40 },
        { date: '2026-09-07', value: 45.04 },
        { date: '2026-10-05', value: 50 },
      ]),
    ).toEqual({ from: 40, to: 50, spanDays: 56 });
  });

  it('needs two different days', () => {
    expect(summarizeSeries([])).toBeNull();
    expect(summarizeSeries([{ date: '2026-08-10', value: 40 }])).toBeNull();
    expect(
      summarizeSeries([
        { date: '2026-08-10', value: 40 },
        { date: '2026-08-10', value: 41 },
      ]),
    ).toBeNull();
  });
});

describe('weeklyBuckets', () => {
  // 2026-10-07 is a Wednesday: the current week starts on Monday 2026-10-05.
  const today = '2026-10-07';

  it('buckets sessions and habit days by ISO week, oldest first, ending with the current week', () => {
    const buckets = weeklyBuckets({
      today,
      weeks: 3,
      planned: 3,
      sessionDates: ['2026-09-22', '2026-09-24', '2026-10-05', '2026-10-06', '2026-10-07'],
      habitDates: ['2026-09-28', '2026-09-28', '2026-09-29', '2026-10-05'],
    });
    expect(buckets).toEqual([
      {
        weekStart: '2026-09-21',
        sessionsDone: 2,
        sessionsPlanned: 3,
        habitDays: 0,
        isCurrent: false,
      },
      {
        weekStart: '2026-09-28',
        sessionsDone: 0,
        sessionsPlanned: 3,
        habitDays: 2,
        isCurrent: false,
      },
      {
        weekStart: '2026-10-05',
        sessionsDone: 3,
        sessionsPlanned: 3,
        habitDays: 1,
        isCurrent: true,
      },
    ]);
  });

  it('puts a Sunday night log in the week that ends, and Monday in the next', () => {
    const buckets = weeklyBuckets({
      today,
      weeks: 2,
      planned: 0,
      // dayKeyFor: Monday 00:30 is still Sunday's logical day.
      sessionDates: [dayKeyFor(new Date(2026, 9, 5, 0, 30)), dayKeyFor(new Date(2026, 9, 5, 4, 0))],
      habitDates: [],
    });
    expect(buckets.map((bucket) => bucket.sessionsDone)).toEqual([1, 1]);
  });

  it('does not show weeks before the person started', () => {
    const buckets = weeklyBuckets({
      today,
      weeks: 8,
      startedOn: '2026-10-01',
      planned: 2,
      sessionDates: [],
      habitDates: [],
    });
    expect(buckets.map((bucket) => bucket.weekStart)).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('handles sparse data: no sessions at all', () => {
    const buckets = weeklyBuckets({ today, planned: 3, sessionDates: [], habitDates: [] });
    expect(buckets).toHaveLength(8);
    expect(hasWeeklyData(buckets)).toBe(false);
    expect(buckets.at(-1)?.isCurrent).toBe(true);
  });

  it('counts planned weekdays once, however many gym entries share them', () => {
    expect(
      plannedPerWeek([
        { days: [1, 3], anchor: 'gymMorning' },
        { days: [3, 5], anchor: 'gymEvening' },
      ]),
    ).toBe(3);
    expect(plannedPerWeek([])).toBe(0);
  });
});

describe('metrics', () => {
  it('parses decimals with a comma or a dot and rejects typos', () => {
    expect(parseMetricInput('61,5', 'kg')).toEqual({ ok: true, value: 61.5 });
    expect(parseMetricInput(' 61.5 ', 'kg')).toEqual({ ok: true, value: 61.5 });
    expect(parseMetricInput('0,1', 'unit')).toEqual({ ok: true, value: 0.1 });
    // More than one decimal is rejected, never rounded.
    expect(parseMetricInput('61.54', 'kg')).toEqual({ ok: false, reason: 'notNumber' });
    expect(parseMetricInput('61,25', 'kg')).toEqual({ ok: false, reason: 'notNumber' });
    // Decimal-safe: values that are awkward in binary floating point stay exact.
    expect(parseMetricInput('1.1', 'unit')).toEqual({ ok: true, value: 1.1 });
    expect(parseMetricInput('72.3', 'cm')).toEqual({ ok: true, value: 72.3 });
    expect(parseMetricInput('', 'kg')).toEqual({ ok: false, reason: 'empty' });
    expect(parseMetricInput('abc', 'kg')).toEqual({ ok: false, reason: 'notNumber' });
    expect(parseMetricInput('61.5.2', 'kg')).toEqual({ ok: false, reason: 'notNumber' });
    expect(parseMetricInput('6', 'kg')).toEqual({ ok: false, reason: 'outOfRange' });
    expect(parseMetricInput('900', 'cm')).toEqual({ ok: false, reason: 'outOfRange' });
    expect(parseMetricInput('72', 'cm')).toEqual({ ok: true, value: 72 });
  });

  it('finds the latest entry whatever the order', () => {
    expect(
      latestEntry([
        { date: '2026-10-05', value: 61 },
        { date: '2026-09-01', value: 62 },
      ]),
    ).toEqual({ date: '2026-10-05', value: 61 });
    expect(latestEntry([])).toBeUndefined();
  });

  it('is due once per week / month / day', () => {
    expect(isEntryDue('weekly', '2026-10-07', undefined)).toBe(true);
    expect(isEntryDue('weekly', '2026-10-07', '2026-10-05')).toBe(false);
    expect(isEntryDue('weekly', '2026-10-07', '2026-10-04')).toBe(true);
    expect(isEntryDue('monthly', '2026-10-31', '2026-10-01')).toBe(false);
    expect(isEntryDue('monthly', '2026-11-01', '2026-10-31')).toBe(true);
    expect(isEntryDue('daily', '2026-10-07', '2026-10-07')).toBe(false);
    expect(isEntryDue('daily', '2026-10-07', '2026-10-06')).toBe(true);
  });
});
