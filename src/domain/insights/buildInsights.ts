// Insights engine (PLAN §12): "lo que descubrimos de ti". Compares the MEANS of two groups of days
// and reports a difference only when it is relevant (per-variable threshold) and both groups have
// enough days. It describes what happened together, never why ("Notamos que..."). Pure: no clock.
import { format, getDay, parseISO, startOfISOWeek } from 'date-fns';

import { DEFAULT_FREE_WEEKDAYS } from '../companion/limits';
import { energyBySleep } from '../companion/rhythm';
import { nightsInWindow, shiftDay } from '../companion/sleepDebt';
import { sleepDurationMin } from '../formulas/sleep';
import { strengthSeries } from '../progress/strength';

import {
  GYM_PERFORMANCE_DIFF_MIN,
  INSIGHTS_WINDOW_DAYS,
  MAX_NEW_PER_WEEK,
  MIN_CHECKIN_DAYS,
  MIN_GROUP_DAYS,
  QUALITY_GOOD_MIN,
  QUALITY_POOR_MAX,
  REPEAT_BLOCK_DAYS,
  SCALE_DIFF_MIN,
  SLEEP_DIFF_MIN,
  STEPS_DIFF_MIN,
  WEEKDAY_LEAD_OVER_SECOND_MIN,
  WEEKDAY_MIN_OBSERVED,
  WEEKDAY_SHARE_DIFF_MIN,
} from './limits';
import type { Insight, InsightData, InsightKind } from './types';

/** How much a kind's value must move to count as "changed meaningfully" (its own threshold). */
export const VALUE_STEP: Readonly<Record<InsightKind, number>> = {
  sleepGym: SLEEP_DIFF_MIN,
  energySleep: SCALE_DIFF_MIN,
  gymSleepQuality: GYM_PERFORMANCE_DIFF_MIN,
  stepsWeek: STEPS_DIFF_MIN,
  // Never repeated within the block, whichever weekday it names (see `isRepeat`).
  bestWeekday: Infinity,
};

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
/** Two decimals: keeps float noise from deciding a boundary (a difference of exactly 20 is 20). */
const round2 = (value: number) => Math.round(value * 100) / 100;
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** Monday (`yyyy-MM-dd`) of the ISO week of a day key. */
export function isoWeekStart(date: string): string {
  return format(startOfISOWeek(parseISO(date)), 'yyyy-MM-dd');
}

type Context = {
  data: InsightData;
  today: string;
  from: string;
  inWindow: (date: string) => boolean;
  free: ReadonlySet<number>;
};

/**
 * Sleep on gym days vs days with POSITIVE evidence of no gym (`data.noGymDates`). A day with no
 * information at all is in neither group: "nothing logged" is not "did not train". A date in both
 * lists counts as a gym day.
 */
function sleepGym({ data, today, inWindow }: Context): Insight | null {
  const gym = new Set(data.gymDates);
  const noGym = new Set(data.noGymDates);
  const withGym: number[] = [];
  const without: number[] = [];
  for (const night of nightsInWindow(data.nights, today, INSIGHTS_WINDOW_DAYS)) {
    if (!inWindow(night.date)) continue;
    const minutes = sleepDurationMin(night.bed, night.wake);
    if (gym.has(night.date)) withGym.push(minutes);
    else if (noGym.has(night.date)) without.push(minutes);
  }
  if (withGym.length < MIN_GROUP_DAYS || without.length < MIN_GROUP_DAYS) return null;
  const diff = round2(mean(withGym) - mean(without));
  if (Math.abs(diff) < SLEEP_DIFF_MIN) return null;
  const variant = diff > 0 ? 'sleepGym.more' : 'sleepGym.less';
  return {
    kind: 'sleepGym',
    variant,
    textKey: `insights.${variant}`,
    params: { minutes: Math.round(Math.abs(diff)) },
    evidence: {
      days: withGym.length + without.length,
      unit: 'days',
      value: Math.round(diff),
      gymDays: withGym.length,
      otherDays: without.length,
    },
  };
}

function energySleep({ data, today, inWindow }: Context): Insight | null {
  const energy = new Map(data.energy.filter((e) => inWindow(e.date)).map((e) => [e.date, e.value]));
  const found = energyBySleep(
    nightsInWindow(data.nights, today, INSIGHTS_WINDOW_DAYS).filter((n) => inWindow(n.date)),
    energy,
  );
  if (found.status !== 'found') return null;
  const { diff, enoughDays, shortDays } = found.value;
  const variant = diff > 0 ? 'energySleep.higher' : 'energySleep.lower';
  return {
    kind: 'energySleep',
    variant,
    textKey: `insights.${variant}`,
    params: { points: oneDecimal(Math.abs(diff)) },
    evidence: {
      days: enoughDays + shortDays,
      unit: 'days',
      value: diff,
      enoughDays,
      shortDays,
    },
  };
}

/** Share (0-100) of exercises per day whose e1RM matched or beat the previous session's. */
export function gymPerformanceByDate(sessions: InsightData['sessions']): Map<string, number> {
  const stepIds = new Set(sessions.flatMap((session) => session.sets.map((set) => set.stepId)));
  const met = new Map<string, { met: number; compared: number }>();
  for (const stepId of stepIds) {
    const series = strengthSeries(sessions, stepId);
    series.forEach((point, index) => {
      const previous = series[index - 1];
      if (!previous) return;
      const entry = met.get(point.date) ?? { met: 0, compared: 0 };
      entry.compared += 1;
      if (point.e1rm >= previous.e1rm) entry.met += 1;
      met.set(point.date, entry);
    });
  }
  return new Map([...met].map(([date, v]) => [date, (v.met / v.compared) * 100]));
}

function gymSleepQuality({ data, inWindow }: Context): Insight | null {
  const quality = new Map(data.quality.map((q) => [q.date, q.value]));
  const good: number[] = [];
  const poor: number[] = [];
  for (const [date, performance] of gymPerformanceByDate(data.sessions)) {
    const value = quality.get(date);
    if (value === undefined || !inWindow(date)) continue;
    if (value >= QUALITY_GOOD_MIN) good.push(performance);
    else if (value <= QUALITY_POOR_MAX) poor.push(performance);
  }
  if (good.length < MIN_GROUP_DAYS || poor.length < MIN_GROUP_DAYS) return null;
  const diff = round2(mean(good) - mean(poor));
  if (Math.abs(diff) < GYM_PERFORMANCE_DIFF_MIN) return null;
  const variant = diff > 0 ? 'gymSleepQuality.better' : 'gymSleepQuality.worse';
  return {
    kind: 'gymSleepQuality',
    variant,
    textKey: `insights.${variant}`,
    params: { points: Math.round(Math.abs(diff)) },
    evidence: {
      days: good.length + poor.length,
      unit: 'days',
      value: Math.round(diff),
      goodDays: good.length,
      poorDays: poor.length,
    },
  };
}

function stepsWeek({ data, inWindow, free }: Context): Insight | null {
  const workdays: number[] = [];
  const weekends: number[] = [];
  const byDate = new Map(data.steps.filter((s) => s.steps > 0).map((s) => [s.date, s.steps]));
  for (const [date, steps] of byDate) {
    if (!inWindow(date)) continue;
    (free.has(getDay(parseISO(date))) ? weekends : workdays).push(steps);
  }
  if (workdays.length < MIN_GROUP_DAYS || weekends.length < MIN_GROUP_DAYS) return null;
  const diff = round2(mean(workdays) - mean(weekends));
  if (Math.abs(diff) < STEPS_DIFF_MIN) return null;
  const variant = diff > 0 ? 'stepsWeek.more' : 'stepsWeek.less';
  return {
    kind: 'stepsWeek',
    variant,
    textKey: `insights.${variant}`,
    params: { steps: Math.round(Math.abs(diff)) },
    evidence: {
      days: workdays.length + weekends.length,
      unit: 'days',
      value: Math.round(diff),
      workdays: workdays.length,
      weekends: weekends.length,
    },
  };
}

function bestWeekday({ data, inWindow }: Context): Insight | null {
  const days = data.activity.filter((day) => inWindow(day.date));
  const byWeekday = new Map<number, { observed: number; moved: number }>();
  for (const day of days) {
    const weekday = getDay(parseISO(day.date));
    const entry = byWeekday.get(weekday) ?? { observed: 0, moved: 0 };
    entry.observed += 1;
    if (day.moved) entry.moved += 1;
    byWeekday.set(weekday, entry);
  }
  const total = days.length;
  const totalMoved = days.filter((day) => day.moved).length;
  const ranked = [...byWeekday]
    .filter(([, entry]) => entry.observed >= WEEKDAY_MIN_OBSERVED)
    .map(([weekday, entry]) => ({ weekday, ...entry, share: entry.moved / entry.observed }))
    .sort((a, b) => b.share - a.share || b.observed - a.observed || a.weekday - b.weekday);
  const top = ranked[0];
  if (!top) return null;
  // The leader must stand out from the runner-up too, not only from the average of the rest.
  const second = ranked[1];
  if (second && round2(top.share - second.share) < WEEKDAY_LEAD_OVER_SECOND_MIN) return null;
  const restObserved = total - top.observed;
  if (restObserved < MIN_GROUP_DAYS) return null;
  const restShare = (totalMoved - top.moved) / restObserved;
  if (round2(top.share - restShare) < WEEKDAY_SHARE_DIFF_MIN) return null;
  return {
    kind: 'bestWeekday',
    variant: 'bestWeekday.top',
    textKey: 'insights.bestWeekday.top',
    params: {
      weekday: top.weekday,
      percent: Math.round(top.share * 100),
      otherPercent: Math.round(restShare * 100),
    },
    evidence: {
      days: total,
      unit: 'days',
      value: top.weekday,
      weekdayDays: top.observed,
      otherDays: restObserved,
    },
  };
}

const COMPARISONS: readonly ((context: Context) => Insight | null)[] = [
  sleepGym,
  energySleep,
  gymSleepQuality,
  stepsWeek,
  bestWeekday,
];

/** Same kind within the last 4 weeks is skipped unless its value moved by at least its step. */
function isRepeat(insight: Insight, data: InsightData, today: string): boolean {
  const since = shiftDay(today, -(REPEAT_BLOCK_DAYS - 1));
  const last = data.history
    .filter((entry) => entry.kind === insight.kind && entry.createdOn >= since)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0];
  if (!last) return false;
  if (last.value === undefined) return true;
  return Math.abs(insight.evidence.value - last.value) < VALUE_STEP[insight.kind];
}

/** True once the window holds `MIN_CHECKIN_DAYS` days with check-ins (the PLAN §12 threshold). */
export function hasEnoughCheckinDays(data: InsightData, today: string): boolean {
  const from = shiftDay(today, -(INSIGHTS_WINDOW_DAYS - 1));
  const days = data.checkinDates.filter((date) => date >= from && date <= today);
  return new Set(days).size >= MIN_CHECKIN_DAYS;
}

/**
 * The NEW insights of this week: none (the common case) or one. `today` is the logical day
 * (`dayKeyFor`), so a run at 02:00 belongs to the previous day.
 */
export function buildInsights(data: InsightData, today: string): Insight[] {
  const week = isoWeekStart(today);
  const thisWeek = data.history.filter((entry) => isoWeekStart(entry.createdOn) === week);
  if (thisWeek.length >= MAX_NEW_PER_WEEK) return [];

  const from = shiftDay(today, -(INSIGHTS_WINDOW_DAYS - 1));
  const inWindow = (date: string) => date >= from && date <= today;
  const withCheckins = new Set(data.checkinDates.filter(inWindow)).size;
  if (withCheckins < MIN_CHECKIN_DAYS) return [];

  const context: Context = {
    data,
    today,
    from,
    inWindow,
    free: new Set(data.freeWeekdays ?? DEFAULT_FREE_WEEKDAYS),
  };
  for (const compare of COMPARISONS) {
    const insight = compare(context);
    if (insight && !isRepeat(insight, data, today)) return [insight];
  }
  return [];
}
