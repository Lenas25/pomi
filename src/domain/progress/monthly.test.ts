import { describe, expect, it } from '@jest/globals';

import {
  buildMonthlyComparison,
  hasComparison,
  nearestTo,
  pairFor,
  photoPairs,
  type MonthlyInput,
} from './monthly';

const TODAY = '2026-10-07'; // 30 days earlier: 2026-09-07

describe('nearestTo / pairFor', () => {
  const points = [
    { date: '2026-08-01', value: 60 },
    { date: '2026-09-03', value: 62 },
    { date: '2026-09-12', value: 61 },
    { date: '2026-10-05', value: 60.2 },
  ];

  it('finds the closest point inside the tolerance, preferring the earlier on a tie', () => {
    expect(nearestTo(points, '2026-09-07')?.date).toBe('2026-09-03');
    expect(nearestTo(points, '2026-09-08')?.date).toBe('2026-09-12');
    expect(nearestTo([{ date: '2026-09-02' }, { date: '2026-09-12' }], '2026-09-07')?.date).toBe(
      '2026-09-02',
    );
    expect(nearestTo(points, '2026-06-01')).toBeUndefined();
    expect(nearestTo([], '2026-09-07')).toBeUndefined();
  });

  it('pairs a month-ago value with the latest later one and reports the change', () => {
    expect(pairFor(points, '2026-09-07')).toEqual({
      from: { date: '2026-09-03', value: 62 },
      to: { date: '2026-10-05', value: 60.2 },
      change: -1.8,
    });
  });

  it('needs a later value: old points alone are not "today"', () => {
    expect(pairFor([{ date: '2026-09-03', value: 62 }], '2026-09-07')).toBeNull();
    expect(
      pairFor(
        [
          { date: '2026-09-01', value: 62 },
          { date: '2026-09-05', value: 61 },
        ],
        '2026-09-07',
      ),
    ).toBeNull();
    expect(pairFor([{ date: '2026-10-05', value: 60 }], '2026-09-07')).toBeNull();
    expect(pairFor([], '2026-09-07')).toBeNull();
  });
});

const photo = (id: number, date: string, pose: string) => ({ id, date, pose, uri: `${id}.jpg` });

describe('photoPairs', () => {
  it('pairs the photo near a month ago with the latest one, per pose', () => {
    const pairs = photoPairs(
      [
        photo(1, '2026-09-06', 'frente'),
        photo(2, '2026-10-06', 'frente'),
        photo(3, '2026-09-06', 'perfil'),
        photo(4, '2026-10-06', 'espalda'),
      ],
      ['frente', 'perfil', 'espalda'],
      '2026-09-07',
    );
    expect(pairs.map((pair) => [pair.pose, pair.then?.id, pair.now?.id])).toEqual([
      ['frente', 1, 2],
      ['perfil', 3, undefined],
      ['espalda', undefined, 4],
    ]);
  });

  it('leaves out poses without photos and never pairs a photo with itself', () => {
    expect(
      photoPairs([photo(1, '2026-09-07', 'frente')], ['frente', 'perfil'], '2026-09-07'),
    ).toEqual([{ pose: 'frente', then: photo(1, '2026-09-07', 'frente') }]);
    expect(photoPairs([], ['frente'], '2026-09-07')).toEqual([]);
  });
});

const set = (weightKg: number, reps: number) => ({ stepId: 'hip', weightKg, reps });

describe('buildMonthlyComparison', () => {
  const base: MonthlyInput = {
    today: TODAY,
    startedOn: '2026-07-01',
    sessions: [
      { date: '2026-08-20', sets: [set(35, 8)] },
      { date: '2026-09-05', sets: [set(40, 8)] },
      { date: '2026-09-20', sets: [set(45, 8)] },
      { date: '2026-10-05', sets: [set(50, 8)] },
    ],
    habitDates: ['2026-08-25', '2026-09-20', '2026-09-21', '2026-10-01'],
    metrics: [
      {
        id: 'peso',
        name: 'Peso',
        unit: 'kg',
        entries: [
          { date: '2026-09-06', value: 62 },
          { date: '2026-10-05', value: 61 },
        ],
      },
      { id: 'cintura', name: 'Cintura', unit: 'cm', entries: [{ date: '2026-10-01', value: 70 }] },
    ],
    photos: [photo(1, '2026-09-06', 'frente'), photo(2, '2026-10-06', 'frente')],
    poses: ['frente', 'perfil', 'espalda'],
  };

  it('compares strength, measurements, photos and consistency', () => {
    const comparison = buildMonthlyComparison(base);
    expect(comparison.thenDate).toBe('2026-09-07');
    expect(comparison.strength).toEqual([
      {
        stepId: 'hip',
        from: { date: '2026-09-05', value: 50.7 },
        to: { date: '2026-10-05', value: 63.3 },
        change: 12.6,
      },
    ]);
    // A measurement with a single value cannot be compared.
    expect(comparison.measurements).toEqual([
      {
        metricId: 'peso',
        name: 'Peso',
        unit: 'kg',
        from: { date: '2026-09-06', value: 62 },
        to: { date: '2026-10-05', value: 61 },
        change: -1,
      },
    ]);
    expect(comparison.photos).toHaveLength(1);
    expect(comparison.consistency).toEqual({
      now: { sessions: 2, habitDays: 3 },
      before: { sessions: 2, habitDays: 1 },
    });
    expect(hasComparison(comparison)).toBe(true);
  });

  it('is honest about a person who started less than a month ago', () => {
    const comparison = buildMonthlyComparison({
      ...base,
      startedOn: '2026-09-25',
      sessions: [{ date: '2026-10-05', sets: [set(50, 8)] }],
      habitDates: [],
      metrics: [],
      photos: [],
    });
    expect(comparison.strength).toEqual([]);
    expect(comparison.measurements).toEqual([]);
    expect(comparison.photos).toEqual([]);
    expect(comparison.consistency.before).toBeNull();
    expect(comparison.consistency.now.sessions).toBe(1);
    expect(hasComparison(comparison)).toBe(false);
  });

  it('handles empty data', () => {
    const comparison = buildMonthlyComparison({
      today: TODAY,
      sessions: [],
      habitDates: [],
      metrics: [],
      photos: [],
      poses: [],
    });
    expect(comparison.strength).toEqual([]);
    expect(hasComparison(comparison)).toBe(false);
  });
});
