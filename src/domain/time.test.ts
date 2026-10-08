import { describe, expect, it } from '@jest/globals';

import { DAY_ROLLOVER_HOUR, dayKeyFor, dayStartFor, minutesIntoDay } from './time';

describe('dayKeyFor (rollover at 04:00)', () => {
  it('keeps 03:59 on the previous day and starts the new day at 04:00', () => {
    expect(dayKeyFor(new Date(2026, 9, 6, 3, 59))).toBe('2026-10-05');
    expect(dayKeyFor(new Date(2026, 9, 6, 4, 0))).toBe('2026-10-06');
  });

  it('puts a night check-in at 00:30 on the day that is ending', () => {
    expect(dayKeyFor(new Date(2026, 9, 6, 0, 30))).toBe('2026-10-05');
    expect(dayKeyFor(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
    expect(dayKeyFor(new Date(2026, 9, 6, 0, 0))).toBe('2026-10-05');
  });

  it('crosses month and year boundaries', () => {
    expect(dayKeyFor(new Date(2026, 10, 1, 2, 0))).toBe('2026-10-31');
    expect(dayKeyFor(new Date(2027, 0, 1, 3, 59))).toBe('2026-12-31');
    expect(dayKeyFor(new Date(2028, 2, 1, 1, 0))).toBe('2028-02-29');
  });

  it('accepts another rollover hour', () => {
    expect(DAY_ROLLOVER_HOUR).toBe(4);
    expect(dayKeyFor(new Date(2026, 9, 6, 5, 59), 6)).toBe('2026-10-05');
    expect(dayKeyFor(new Date(2026, 9, 6, 6, 0), 6)).toBe('2026-10-06');
    expect(dayKeyFor(new Date(2026, 9, 6, 0, 30), 0)).toBe('2026-10-06');
  });
});

describe('dayStartFor / minutesIntoDay', () => {
  it('opens the logical day at its local midnight', () => {
    expect(dayStartFor(new Date(2026, 9, 6, 3, 59)).getTime()).toBe(new Date(2026, 9, 5).getTime());
    expect(dayStartFor(new Date(2026, 9, 6, 4, 0)).getTime()).toBe(new Date(2026, 9, 6).getTime());
  });

  it('counts past 1440 between midnight and the rollover (agenda convention)', () => {
    expect(minutesIntoDay(new Date(2026, 9, 6, 0, 30))).toBe(1470);
    expect(minutesIntoDay(new Date(2026, 9, 6, 3, 59))).toBe(1679);
    expect(minutesIntoDay(new Date(2026, 9, 6, 4, 0))).toBe(240);
    expect(minutesIntoDay(new Date(2026, 9, 6, 23, 59))).toBe(1439);
  });
});
