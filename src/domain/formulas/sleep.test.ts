import { describe, expect, it } from '@jest/globals';

import { bedtimeFor, sleepCycleBedtimes, sleepDurationMin, summarizeSleep } from './sleep';

describe('bedtimeFor', () => {
  it('is wake − target', () => {
    expect(bedtimeFor('05:10', 7.5)).toBe('21:40');
    expect(bedtimeFor('07:00', 8)).toBe('23:00');
  });

  it('crosses midnight', () => {
    expect(bedtimeFor('06:00', 7)).toBe('23:00');
    expect(bedtimeFor('08:30', 8.5)).toBe('00:00');
    expect(bedtimeFor('01:00', 2)).toBe('23:00');
  });

  it('rejects impossible targets', () => {
    expect(() => bedtimeFor('06:00', 0)).toThrow(RangeError);
    expect(() => bedtimeFor('06:00', 25)).toThrow(RangeError);
  });
});

describe('sleepDurationMin', () => {
  it('handles sleep that crosses midnight', () => {
    expect(sleepDurationMin('23:00', '06:30')).toBe(450);
    expect(sleepDurationMin('00:30', '07:00')).toBe(390);
  });

  it('handles sleep that does not cross midnight (nap)', () => {
    expect(sleepDurationMin('14:00', '15:30')).toBe(90);
  });
});

describe('summarizeSleep', () => {
  const day = (n: number, bed: string, wake: string) => ({
    date: `2026-03-${String(n).padStart(2, '0')}`,
    bed,
    wake,
  });

  it('returns null without check-ins', () => {
    expect(summarizeSleep([])).toBeNull();
  });

  it('averages duration and reports the wake-time range', () => {
    const summary = summarizeSleep([
      day(1, '22:00', '05:00'), // 420
      day(2, '22:30', '05:30'), // 420
      day(3, '23:00', '06:00'), // 420
      day(4, '22:00', '06:00'), // 480
    ]);
    expect(summary).toEqual({ days: 4, avgDurationMin: 435, wakeRegularityMin: 60 });
  });

  it('uses only the last 7 days by date, whatever the input order', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      day(i + 1, '23:00', i < 3 ? '10:00' : '06:00'),
    );
    const summary = summarizeSleep([...many].reverse());
    expect(summary?.days).toBe(7);
    expect(summary?.avgDurationMin).toBe(420);
    expect(summary?.wakeRegularityMin).toBe(0);
  });

  it('has no regularity with a single day', () => {
    expect(summarizeSleep([day(1, '23:00', '06:00')])?.wakeRegularityMin).toBeNull();
  });

  it('measures regularity across midnight on the circle', () => {
    const summary = summarizeSleep([day(1, '16:00', '23:50'), day(2, '16:30', '00:10')]);
    expect(summary?.wakeRegularityMin).toBe(20);
  });
});

describe('sleepCycleBedtimes', () => {
  it('computes bedtimes for 4, 5 and 6 cycles with 15 min to fall asleep', () => {
    expect(sleepCycleBedtimes('07:00')).toEqual([
      { cycles: 4, sleepMin: 360, bedtime: '00:45' },
      { cycles: 5, sleepMin: 450, bedtime: '23:15' },
      { cycles: 6, sleepMin: 540, bedtime: '21:45' },
    ]);
  });

  it('matches the PLAN example for a 05:10 wake time', () => {
    expect(sleepCycleBedtimes('05:10').map((option) => option.bedtime)).toEqual([
      '22:55',
      '21:25',
      '19:55',
    ]);
  });

  it('supports custom cycle counts and fall-asleep time', () => {
    expect(
      sleepCycleBedtimes('06:00', { cycleCounts: [6, 5], fallAsleepMin: 0 }).map(
        (option) => option.bedtime,
      ),
    ).toEqual(['22:30', '21:00']);
  });
});
