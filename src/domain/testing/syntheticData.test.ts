import { describe, expect, it } from '@jest/globals';

import { clockToMinutes } from '../time';

import { createRng, generateSyntheticDays } from './syntheticData';

const average = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(7);
    const b = createRng(7);
    const seq = Array.from({ length: 50 }, () => a());
    expect(seq).toEqual(Array.from({ length: 50 }, () => b()));
    expect(seq.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(createRng(8)()).not.toBe(createRng(7)());
  });
});

describe('generateSyntheticDays', () => {
  const days = generateSyntheticDays();

  it('generates 60 consecutive days ending on the end date', () => {
    expect(days).toHaveLength(60);
    expect(days[0]?.date).toBe('2025-12-03');
    expect(days.at(-1)?.date).toBe('2026-01-31');
    expect(new Set(days.map((day) => day.date)).size).toBe(60);
  });

  it('is reproducible and varies with the seed', () => {
    expect(generateSyntheticDays()).toEqual(days);
    expect(generateSyntheticDays({ seed: 2 })).not.toEqual(days);
  });

  it('keeps every value in a plausible range', () => {
    for (const day of days) {
      expect(day.morning.sleepMin).toBeGreaterThanOrEqual(240);
      expect(day.morning.sleepMin).toBeLessThanOrEqual(600);
      for (const score of [day.morning.quality, day.night.energy, day.night.mood]) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }
      expect(day.steps).toBeGreaterThan(0);
      expect(day.waterByHour.reduce((a, b) => a + b, 0)).toBe(day.waterMl);
      expect(clockToMinutes(day.morning.wake)).toBeGreaterThanOrEqual(0);
    }
  });

  it('only schedules gym Monday to Thursday and labels the activity', () => {
    for (const day of days) {
      if (day.gym) {
        expect(day.weekday).toBeGreaterThanOrEqual(1);
        expect(day.weekday).toBeLessThanOrEqual(4);
        expect(day.activity).toBe('gym');
      }
    }
    expect(days.filter((day) => day.gym).length).toBeGreaterThan(15);
  });

  it('embeds findable effects: longer sleep on gym days and later weekends', () => {
    const sleepGym = average(days.filter((d) => d.gym).map((d) => d.morning.sleepMin));
    const sleepRest = average(
      days.filter((d) => !d.gym && d.weekday < 5).map((d) => d.morning.sleepMin),
    );
    expect(sleepGym - sleepRest).toBeGreaterThan(20);

    const wake = (weekend: boolean) =>
      average(
        days
          .filter((d) => (d.weekday === 0 || d.weekday === 6) === weekend)
          .map((d) => clockToMinutes(d.morning.wake)),
      );
    expect(wake(true) - wake(false)).toBeGreaterThan(45);
  });

  it('has an afternoon water dip', () => {
    const at = (hours: number[]) =>
      average(days.flatMap((d) => hours.map((hour) => d.waterByHour[hour] ?? 0)));
    expect(at([14, 15, 16, 17])).toBeLessThan(at([8, 9, 10, 11]) * 0.7);
  });

  it('honours days, end date and the gym effect option', () => {
    const short = generateSyntheticDays({ days: 7, endDate: new Date(2026, 5, 15) });
    expect(short).toHaveLength(7);
    expect(short.at(-1)?.date).toBe('2026-06-15');
    const none = generateSyntheticDays({ gymSleepBonusMin: 0, seed: 3 });
    const gap =
      average(none.filter((d) => d.gym).map((d) => d.morning.sleepMin)) -
      average(none.filter((d) => !d.gym && d.weekday < 5).map((d) => d.morning.sleepMin));
    expect(Math.abs(gap)).toBeLessThan(20);
  });
});
