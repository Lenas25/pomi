import { describe, expect, it } from '@jest/globals';

import type { ProgressData } from './loadProgress';
import { buildProgressView, dayLabel, dayNumber } from './progressView';

const base: ProgressData = {
  today: '2026-10-07',
  startedOn: '2026-08-01',
  gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' }],
  sessions: [],
  habitDates: [],
  exerciseNames: { hip: 'Hip thrust', sq: 'Sentadilla' },
  metrics: [],
};

const set = (stepId: string, weightKg: number | null, reps: number | null) => ({
  stepId,
  weightKg,
  reps,
});

describe('buildProgressView', () => {
  it('is empty and safe for a new person (no data anywhere)', () => {
    const view = buildProgressView(base);
    expect(view.weekly.hasData).toBe(false);
    expect(view.weekly.planned).toBe(3);
    expect(view.strength).toEqual({ exercises: [], selectedId: null, points: [], summary: null });
    expect(view.measurements).toEqual([]);
  });

  it('builds the strength line of the selected exercise, falling back to the first', () => {
    const data: ProgressData = {
      ...base,
      sessions: [
        { date: '2026-08-10', sets: [set('hip', 40, 8), set('sq', 60, 5)] },
        { date: '2026-09-07', sets: [set('hip', 45, 8)] },
        { date: '2026-10-05', sets: [set('hip', 50, 8)] },
      ],
    };
    const view = buildProgressView(data);
    expect(view.strength.selectedId).toBe('hip');
    expect(view.strength.exercises).toEqual([
      { id: 'hip', name: 'Hip thrust' },
      { id: 'sq', name: 'Sentadilla' },
    ]);
    expect(view.strength.points.map((point) => point.e1rm)).toEqual([50.7, 57, 63.3]);
    expect(view.strength.summary).toEqual({ from: 50.7, to: 63.3, spanDays: 56 });

    const squat = buildProgressView(data, 'sq');
    expect(squat.strength.selectedId).toBe('sq');
    expect(squat.strength.summary).toBeNull();
    expect(buildProgressView(data, 'ghost').strength.selectedId).toBe('hip');
  });

  it('weekly buckets use the planned gym days and skip weeks before the start', () => {
    const view = buildProgressView({
      ...base,
      startedOn: '2026-09-28',
      sessions: [{ date: '2026-10-05', sets: [set('hip', 40, 8)] }],
      habitDates: ['2026-10-06'],
    });
    expect(view.weekly.buckets.map((bucket) => bucket.weekStart)).toEqual([
      '2026-09-28',
      '2026-10-05',
    ]);
    expect(view.weekly.buckets[1]).toMatchObject({
      sessionsDone: 1,
      sessionsPlanned: 3,
      habitDays: 1,
      isCurrent: true,
    });
    expect(view.weekly.hasData).toBe(true);
  });

  it('measurements: sorted points, latest, due and the change summary', () => {
    const view = buildProgressView({
      ...base,
      metrics: [
        {
          id: 'peso',
          name: 'Peso',
          unit: 'kg',
          frequency: 'weekly',
          entries: [
            { date: '2026-09-28', value: 61 },
            { date: '2026-09-21', value: 62 },
          ],
        },
        { id: 'cintura', name: 'Cintura', unit: 'cm', frequency: 'monthly', entries: [] },
      ],
    });
    expect(view.measurements[0]).toMatchObject({
      latest: { date: '2026-09-28', value: 61 },
      due: true,
      summary: { from: 62, to: 61, spanDays: 7 },
    });
    expect(view.measurements[1]).toMatchObject({ latest: undefined, due: true, summary: null });
  });
});

describe('chart days', () => {
  it('round trips a date through the day number', () => {
    expect(dayLabel(dayNumber('2026-10-05'))).toBe('5/10');
    expect(dayNumber('2026-10-06') - dayNumber('2026-10-05')).toBe(1);
  });
});
