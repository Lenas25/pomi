// Social jetlag (PLAN §14b): |mid-sleep on free days - mid-sleep on work days| from the morning
// check-ins of the last 14 days. A night belongs to the day it ends on (the morning check-in date),
// so the nights before Saturday and Sunday are the "free" ones.
import { getDay, parseISO } from 'date-fns';

import { MINUTES_PER_DAY, clockToMinutes } from '../time';
import { sleepDurationMin, type MorningCheckin } from '../formulas/sleep';

import {
  DEFAULT_FREE_WEEKDAYS,
  JETLAG_MENTION_MIN,
  JETLAG_MIN_FREE_NIGHTS,
  JETLAG_MIN_WORK_NIGHTS,
  JETLAG_WINDOW_DAYS,
} from './limits';
import { nightsInWindow } from './sleepDebt';

export type SocialJetlag = {
  jetlagMin: number;
  freeNights: number;
  workNights: number;
  /** From 60 minutes it is worth mentioning (gently). */
  notable: boolean;
};

/** Mid-sleep of one night as a minute of the 24 h circle: bedtime + duration / 2. */
export function midSleepMin(night: MorningCheckin): number {
  const mid = clockToMinutes(night.bed) + sleepDurationMin(night.bed, night.wake) / 2;
  return mid % MINUTES_PER_DAY;
}

/** Mean of minutes on the 24 h circle (23:50 and 00:10 average to 00:00, not 12:00). */
export function circularMean(minutes: readonly number[]): number {
  let x = 0;
  let y = 0;
  for (const value of minutes) {
    const angle = (value / MINUTES_PER_DAY) * 2 * Math.PI;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  const angle = Math.atan2(y, x);
  return (
    ((((angle / (2 * Math.PI)) * MINUTES_PER_DAY) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY
  );
}

/** Shortest distance between two minutes on the 24 h circle. */
export function circularDistance(a: number, b: number): number {
  const gap = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(gap, MINUTES_PER_DAY - gap);
}

/** Splits the window's nights into free-day and work-day nights (by the morning's weekday). */
export function splitNights(
  nights: readonly MorningCheckin[],
  freeWeekdays: readonly number[],
): { free: MorningCheckin[]; work: MorningCheckin[] } {
  const free: MorningCheckin[] = [];
  const work: MorningCheckin[] = [];
  for (const night of nights) {
    (freeWeekdays.includes(getDay(parseISO(night.date))) ? free : work).push(night);
  }
  return { free, work };
}

/** `null` without at least 2 free-day and 3 work-day nights in the last 14 days. */
export function socialJetlag(
  nights: readonly MorningCheckin[],
  today: string,
  freeWeekdays: readonly number[] = DEFAULT_FREE_WEEKDAYS,
): SocialJetlag | null {
  const { free, work } = splitNights(
    nightsInWindow(nights, today, JETLAG_WINDOW_DAYS),
    freeWeekdays,
  );
  if (free.length < JETLAG_MIN_FREE_NIGHTS || work.length < JETLAG_MIN_WORK_NIGHTS) return null;

  const jetlagMin = Math.round(
    circularDistance(circularMean(free.map(midSleepMin)), circularMean(work.map(midSleepMin))),
  );
  return {
    jetlagMin,
    freeNights: free.length,
    workNights: work.length,
    notable: jetlagMin >= JETLAG_MENTION_MIN,
  };
}
