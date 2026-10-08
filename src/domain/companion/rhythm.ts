// "Tu ritmo" (PLAN §14b): a prudent lifestyle profile from the check-ins. It needs 21 days with
// data and 7 days in each group it compares (PLAN §12); until then it only reports the progress.
// Everything is a tendency, never a label or a diagnosis.
import { getDay, parseISO } from 'date-fns';

import { MINUTES_PER_DAY } from '../time';
import { sleepDurationMin, type MorningCheckin } from '../formulas/sleep';

import {
  ACTIVE_WEEKDAY_MIN_OBSERVED,
  ACTIVE_WEEKDAY_MIN_SHARE,
  DEFAULT_FREE_WEEKDAYS,
  ENERGY_DIFF_MIN,
  ENOUGH_SLEEP_MIN,
  EVENING_MIDSLEEP_AFTER_MIN,
  MORNING_MIDSLEEP_BEFORE_MIN,
  RHYTHM_MIN_DAYS,
  RHYTHM_MIN_FREE_NIGHTS,
  RHYTHM_MIN_GROUP,
  RHYTHM_WINDOW_DAYS,
} from './limits';
import { circularMean, midSleepMin, splitNights } from './socialJetlag';
import { nightsInWindow, shiftDay } from './sleepDebt';

export type Chronotype = 'morning' | 'intermediate' | 'evening';

export type EnergyBySleep = {
  /** Mean energy (1-5) the days after nights of 7 hours or more, and after shorter ones. */
  enoughAvg: number;
  shortAvg: number;
  enoughDays: number;
  shortDays: number;
  /** enough - short, one decimal. */
  diff: number;
};

/** A day with movement data: gym or walk answers, and steps when known. */
export type ActivityDay = { date: string; moved: boolean; steps?: number | undefined };

export type RhythmInput = {
  today: string;
  /** Morning check-ins (bed and wake), at least the last 42 days. */
  nights: readonly MorningCheckin[];
  /** Energy 1-5 from the evening check-in of each day. */
  energy: readonly { date: string; value: number }[];
  /** Days that have a gym session, an activity answer or steps. */
  activity: readonly ActivityDay[];
  /** Days with ANY check-in (morning or night). */
  checkinDates: readonly string[];
  freeWeekdays?: readonly number[];
};

export type Rhythm = {
  /** Days with check-ins in the last 42 days. */
  daysWithData: number;
  needed: number;
  /** `false`: show "aún te estoy conociendo (X/21 días)". */
  ready: boolean;
  chronotype: { tendency: Chronotype; midSleepMin: number; freeNights: number } | null;
  /** Weekdays (0 = Sunday) with the most movement, at most two. */
  activeWeekdays: number[];
  energy:
    | { status: 'found'; value: EnergyBySleep }
    | { status: 'none'; value: EnergyBySleep }
    | { status: 'insufficient' };
};

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** Tendency from the mid-sleep of free days. Before 03:30 morning, until 05:00 intermediate. */
export function chronotypeOf(midSleep: number): Chronotype {
  // Re-based to 18:00 so a mid-sleep around midnight stays on one side of the cut.
  const shifted = (midSleep - 18 * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const morning = (MORNING_MIDSLEEP_BEFORE_MIN - 18 * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const evening = (EVENING_MIDSLEEP_AFTER_MIN - 18 * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (shifted < morning) return 'morning';
  return shifted > evening ? 'evening' : 'intermediate';
}

function energyBySleep(
  nights: readonly MorningCheckin[],
  energy: ReadonlyMap<string, number>,
): Rhythm['energy'] {
  const enough: number[] = [];
  const short: number[] = [];
  for (const night of nights) {
    const value = energy.get(night.date);
    if (value === undefined) continue;
    (sleepDurationMin(night.bed, night.wake) >= ENOUGH_SLEEP_MIN ? enough : short).push(value);
  }
  if (enough.length < RHYTHM_MIN_GROUP || short.length < RHYTHM_MIN_GROUP) {
    return { status: 'insufficient' };
  }
  const value: EnergyBySleep = {
    enoughAvg: oneDecimal(mean(enough)),
    shortAvg: oneDecimal(mean(short)),
    enoughDays: enough.length,
    shortDays: short.length,
    diff: oneDecimal(mean(enough) - mean(short)),
  };
  return {
    status: Math.abs(mean(enough) - mean(short)) >= ENERGY_DIFF_MIN ? 'found' : 'none',
    value,
  };
}

function activeWeekdays(activity: readonly ActivityDay[]): number[] {
  const byWeekday = new Map<number, ActivityDay[]>();
  for (const day of activity) {
    const weekday = getDay(parseISO(day.date));
    byWeekday.set(weekday, [...(byWeekday.get(weekday) ?? []), day]);
  }
  return [...byWeekday.entries()]
    .map(([weekday, days]) => {
      const stepValues = days.flatMap((day) => (day.steps === undefined ? [] : [day.steps]));
      return {
        weekday,
        observed: days.length,
        share: days.filter((day) => day.moved).length / days.length,
        steps: stepValues.length > 0 ? mean(stepValues) : 0,
      };
    })
    .filter(
      (entry) =>
        entry.observed >= ACTIVE_WEEKDAY_MIN_OBSERVED && entry.share >= ACTIVE_WEEKDAY_MIN_SHARE,
    )
    .sort((a, b) => b.share - a.share || b.steps - a.steps || a.weekday - b.weekday)
    .slice(0, 2)
    .map((entry) => entry.weekday);
}

export function buildRhythm(input: RhythmInput): Rhythm {
  const { today, freeWeekdays = DEFAULT_FREE_WEEKDAYS } = input;
  const from = shiftDay(today, -(RHYTHM_WINDOW_DAYS - 1));
  const inWindow = (date: string) => date >= from && date <= today;

  const daysWithData = new Set(input.checkinDates.filter(inWindow)).size;
  const base: Rhythm = {
    daysWithData,
    needed: RHYTHM_MIN_DAYS,
    ready: daysWithData >= RHYTHM_MIN_DAYS,
    chronotype: null,
    activeWeekdays: [],
    energy: { status: 'insufficient' },
  };
  if (!base.ready) return base;

  const nights = nightsInWindow(input.nights, today, RHYTHM_WINDOW_DAYS);
  const { free } = splitNights(nights, freeWeekdays);
  const chronotype =
    free.length >= RHYTHM_MIN_FREE_NIGHTS
      ? (() => {
          const mid = circularMean(free.map(midSleepMin));
          return {
            tendency: chronotypeOf(mid),
            midSleepMin: Math.round(mid),
            freeNights: free.length,
          };
        })()
      : null;

  const energy = new Map(
    input.energy.filter((entry) => inWindow(entry.date)).map((e) => [e.date, e.value]),
  );
  return {
    ...base,
    chronotype,
    activeWeekdays: activeWeekdays(input.activity.filter((day) => inWindow(day.date))),
    energy: energyBySleep(nights, energy),
  };
}
