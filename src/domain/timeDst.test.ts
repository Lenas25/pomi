import { describe, expect, it } from '@jest/globals';

import { dayKeyFor, dayStartFor, minutesIntoDay } from './time';

// Agenda minutes are local WALL-CLOCK minutes since the logical day's midnight (`atMinutes` builds
// `new Date(y, m, d, 0, minutes)`). These tests run in a DST time zone to prove the two agree.
// The zone itself comes from `jest.global-setup.js` (TZ=America/New_York for the whole suite).

function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

describe('minutesIntoDay across daylight-saving changes', () => {
  it('runs in the DST zone (spring forward 2026-03-08, fall back 2026-11-01)', () => {
    expect(new Date(2026, 2, 8, 12).getTimezoneOffset()).toBe(240);
    expect(new Date(2026, 2, 7, 12).getTimezoneOffset()).toBe(300);
  });

  it.each([
    ['spring forward', new Date(2026, 2, 8, 12)],
    ['fall back', new Date(2026, 10, 1, 12)],
    ['an ordinary day', new Date(2026, 5, 10, 12)],
  ])('round trips every half hour from %s to the rollover of the next day', (_name, noon) => {
    const start = dayStartFor(noon);
    // The logical day runs 04:00 -> 27:59 (minutes 240..1679) on the wall clock.
    for (let step = 8; step <= 55; step += 1) {
      const moment = atMinutes(start, step * 30);
      // Skip the nonexistent hour of the spring-forward gap (the Date constructor shifts it).
      if (moment.getHours() * 60 + moment.getMinutes() !== (step * 30) % 1440) continue;
      expect(dayKeyFor(moment)).toBe(dayKeyFor(noon));
      expect(minutesIntoDay(moment)).toBe(step * 30);
    }
  });

  it('keeps 00:30 after a 23-hour day at minute 1470 of the day that is ending', () => {
    expect(minutesIntoDay(new Date(2026, 2, 9, 0, 30))).toBe(1470);
    expect(dayKeyFor(new Date(2026, 2, 9, 0, 30))).toBe('2026-03-08');
    expect(minutesIntoDay(new Date(2026, 2, 8, 3, 30))).toBe(1650);
  });

  it('keeps 00:30 after a 25-hour day at minute 1470 and 03:59 at 1679', () => {
    expect(minutesIntoDay(new Date(2026, 10, 2, 0, 30))).toBe(1470);
    expect(minutesIntoDay(new Date(2026, 10, 2, 3, 59))).toBe(1679);
    expect(minutesIntoDay(new Date(2026, 10, 2, 4, 0))).toBe(240);
  });
});
