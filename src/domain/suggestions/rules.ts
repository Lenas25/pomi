// The six rules of PLAN §11. Each is a pure function `(data, today) => Suggestion | null`: it only
// decides whether its condition holds and what the change would be. Limits (weekly maximum,
// rejected kinds, duplicates) are applied afterwards by `buildSuggestions`.
import { format, getDay, parseISO, subDays } from 'date-fns';

import { circularRange, sleepDurationMin } from '../formulas/sleep';
import { proposeStepsAdjustment } from '../formulas/steps';
import { isStalled } from '../gym/todayTarget';
import { clockToMinutes, minutesToClock } from '../time';

import {
  BED_SHIFT_LIMIT_MIN,
  BED_STEP_MIN,
  GYM_MISSED,
  GYM_WEEKS,
  MIN_SLEEP_DAYS,
  SLEEP_SHORT_BY_MIN,
  STEPS_MIN_DATA_DAYS,
  WAKE_RANGE_MIN,
  WATER_SHIFT_LIMIT_MIN,
  WATER_SHORT_DAYS,
  WATER_SHORT_FRACTION,
  WATER_STEP_MIN,
  WATER_WINDOW_DAYS,
} from './limits';
import type { Suggestion, SuggestionData } from './types';

export type Rule = (data: SuggestionData, today: string) => Suggestion | null;

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');
const daysAgo = (today: string, count: number) => dayKey(subDays(parseISO(today), count));

/** `6 h 40 min` (no minutes part when exact: `7 h`). */
export function formatDuration(totalMin: number): string {
  const rounded = Math.round(totalMin);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Morning check-ins of the last 7 days (today included). */
function lastWeekSleep(data: SuggestionData, today: string) {
  const from = daysAgo(today, 6);
  return data.sleep.filter((entry) => entry.date >= from && entry.date <= today);
}

// --- Dormir antes ------------------------------------------------------------------------------

export const sleepEarlierRule: Rule = (data, today) => {
  const week = lastWeekSleep(data, today);
  const targetH = data.anchors.sleepTargetH;
  if (week.length < MIN_SLEEP_DAYS || targetH === undefined) return null;

  const targetMin = Math.round(targetH * 60);
  const avgMin = Math.round(
    week.reduce((sum, entry) => sum + sleepDurationMin(entry.bed, entry.wake), 0) / week.length,
  );
  if (!(avgMin < targetMin - SLEEP_SHORT_BY_MIN)) return null;

  const fromMin = data.shifts.bedMin ?? 0;
  const toMin = fromMin - BED_STEP_MIN;
  // "15 minutes, never more": the total drift from the original plan is capped too.
  if (toMin < BED_SHIFT_LIMIT_MIN) return null;

  return {
    kind: 'sleepEarlier',
    variant: 'sleepEarlier',
    change: { type: 'bedtimeShift', fromMin, toMin },
    textKey: 'suggestions.sleepEarlier.text',
    reasonKey: 'suggestions.sleepEarlier.reason',
    params: {
      avg: formatDuration(avgMin),
      target: formatDuration(targetMin),
      minutes: BED_STEP_MIN,
    },
    evidence: { days: week.length, avgMin, targetMin },
  };
};

// --- Regularidad -------------------------------------------------------------------------------

/** Median wake time on the 24 h circle, rounded to 5 minutes. */
function medianWake(wakes: readonly number[]): number {
  // Unwrap around the first value so 23:50 and 00:10 sit next to each other.
  const base = wakes[0] ?? 0;
  const unwrapped = wakes
    .map((minute) => {
      const delta = ((minute - base + 1440 + 720) % 1440) - 720;
      return base + delta;
    })
    .sort((a, b) => a - b);
  const middle = Math.floor(unwrapped.length / 2);
  const median =
    unwrapped.length % 2 === 1
      ? (unwrapped[middle] ?? base)
      : ((unwrapped[middle - 1] ?? base) + (unwrapped[middle] ?? base)) / 2;
  return Math.round(median / 5) * 5;
}

export const wakeRegularityRule: Rule = (data, today) => {
  const week = lastWeekSleep(data, today);
  if (week.length < MIN_SLEEP_DAYS) return null;
  const wakes = week.map((entry) => clockToMinutes(entry.wake));
  const rangeMin = circularRange(wakes);
  if (!(rangeMin > WAKE_RANGE_MIN)) return null;

  // The plan's wake time when there is one, otherwise what the person usually does.
  const time = data.anchors.wake ?? minutesToClock(medianWake(wakes));
  return {
    kind: 'wakeRegularity',
    variant: 'wakeRegularity',
    change: { type: 'wakeTime', to: time },
    textKey: 'suggestions.wakeRegularity.text',
    reasonKey: 'suggestions.wakeRegularity.reason',
    params: { time, range: formatDuration(rangeMin) },
    evidence: { days: week.length, rangeMin, time },
  };
};

// --- Pasos -------------------------------------------------------------------------------------

export const stepsGoalRule: Rule = (data, today) => {
  const { plan, history, cap } = data.steps;
  if (plan.phase !== 'active' || plan.goal === null || plan.baseline === null) return null;

  const stepsOn = new Map(
    history.filter((row) => row.steps > 0).map((row) => [row.date, row.steps] as const),
  );
  // The week that just ended (yesterday back 7 days) and the one before it. Today is still going.
  const weekOf = (endOffset: number) =>
    Array.from({ length: 7 }, (_, index) => daysAgo(today, endOffset + index));
  const metIn = (days: readonly string[], goal: number) => {
    const withData = days.flatMap((date) => stepsOn.get(date) ?? []);
    return withData.length >= STEPS_MIN_DATA_DAYS
      ? withData.filter((steps) => steps >= goal).length
      : undefined;
  };

  const thisWeek = weekOf(1);
  const daysMetThisWeek = metIn(thisWeek, plan.goal);
  if (daysMetThisWeek === undefined) return null;

  // A goal changed through a suggestion within the previous two weeks makes that week
  // incomparable: do not count it toward "two weeks below".
  const changedRecently = data.history.some(
    (entry) =>
      entry.kind === 'stepsGoal' &&
      entry.status === 'accepted' &&
      entry.decidedOn !== null &&
      entry.decidedOn >= daysAgo(today, 14),
  );
  const daysMetPreviousWeek = changedRecently ? undefined : metIn(weekOf(8), plan.goal);

  const adjustment = proposeStepsAdjustment({
    currentGoal: plan.goal,
    baseline: plan.baseline,
    ...(cap !== undefined ? { cap } : {}),
    daysMetThisWeek,
    ...(daysMetPreviousWeek !== undefined ? { daysMetPreviousWeek } : {}),
  });
  if (adjustment.kind === 'keep') return null;

  const raise = adjustment.kind === 'raise';
  return {
    kind: 'stepsGoal',
    variant: raise ? 'stepsRaise' : 'stepsLower',
    change: { type: 'stepsGoal', from: plan.goal, to: adjustment.newGoal },
    textKey: raise ? 'suggestions.stepsRaise.text' : 'suggestions.stepsLower.text',
    reasonKey: raise ? 'suggestions.stepsRaise.reason' : 'suggestions.stepsLower.reason',
    params: {
      met: daysMetThisWeek,
      total: 7,
      goal: plan.goal,
      newGoal: adjustment.newGoal,
    },
    evidence: {
      days: 7,
      daysMet: daysMetThisWeek,
      goal: plan.goal,
      ...(daysMetPreviousWeek !== undefined ? { daysMetPreviousWeek } : {}),
    },
  };
};

// --- Agua --------------------------------------------------------------------------------------

export const waterEarlierRule: Rule = (data, today) => {
  const from = daysAgo(today, WATER_WINDOW_DAYS);
  const to = daysAgo(today, 1);
  const days = data.water.filter((day) => day.date >= from && day.date <= to);
  if (days.length < WATER_SHORT_DAYS) return null;

  // "Under 60%": compared in integers so 3 of 5 glasses (exactly 60%) is not short.
  const short = days.filter(
    (day) => day.glassesAt18 * 100 < day.targetGlasses * WATER_SHORT_FRACTION * 100,
  );
  if (short.length < WATER_SHORT_DAYS) return null;

  const fromMin = data.shifts.waterMin ?? 0;
  const toMin = fromMin - WATER_STEP_MIN;
  if (toMin < WATER_SHIFT_LIMIT_MIN) return null;

  return {
    kind: 'waterEarlier',
    variant: 'waterEarlier',
    change: { type: 'waterShift', fromMin, toMin },
    textKey: 'suggestions.waterEarlier.text',
    reasonKey: 'suggestions.waterEarlier.reason',
    params: { short: short.length, total: days.length, minutes: WATER_STEP_MIN },
    evidence: { days: days.length, shortDays: short.length },
  };
};

// --- Día del gym -------------------------------------------------------------------------------

/** Forward distance (1..6) from weekday `from` to weekday `to`. */
const forwardDays = (from: number, to: number) => (to - from + 7) % 7;
/** Monday first, Sunday last (the order people read a week in). */
const weekOrder = (weekday: number) => (weekday + 6) % 7;

export const gymDayRule: Rule = (data, today) => {
  const planned = new Set(data.gymDays.flatMap((entry) => entry.days));
  if (planned.size === 0 || planned.size >= 7) return null;

  const windowDays = GYM_WEEKS * 7;
  const dates = Array.from({ length: windowDays }, (_, index) => daysAgo(today, index + 1));
  // Four FULL weeks of the plan: nothing to judge before then.
  if (data.startedOn !== undefined && data.startedOn > (dates.at(-1) ?? today)) return null;

  const trained = new Set(data.gymDates);
  const candidates = [...planned]
    .map((weekday) => {
      const occurrences = dates.filter((date) => getDay(parseISO(date)) === weekday);
      return { weekday, missed: occurrences.filter((date) => !trained.has(date)).length };
    })
    .filter((entry) => entry.missed >= GYM_MISSED)
    .sort((a, b) => b.missed - a.missed || weekOrder(a.weekday) - weekOrder(b.weekday));
  const worst = candidates[0];
  if (!worst) return null;

  // Where to: a free weekday the person already trained on, else the next free one.
  const free = [0, 1, 2, 3, 4, 5, 6].filter((weekday) => !planned.has(weekday));
  const usual = (weekday: number) =>
    dates.filter((date) => getDay(parseISO(date)) === weekday && trained.has(date)).length;
  const target = [...free].sort(
    (a, b) => usual(b) - usual(a) || forwardDays(worst.weekday, a) - forwardDays(worst.weekday, b),
  )[0];
  if (target === undefined) return null;

  return {
    kind: 'gymDay',
    variant: 'gymDay',
    change: { type: 'moveGymDay', fromDay: worst.weekday, toDay: target },
    textKey: 'suggestions.gymDay.text',
    reasonKey: 'suggestions.gymDay.reason',
    params: { fromDay: worst.weekday, toDay: target, missed: worst.missed, weeks: GYM_WEEKS },
    evidence: { days: windowDays, missed: worst.missed, weeks: GYM_WEEKS },
  };
};

// --- Descarga ----------------------------------------------------------------------------------

/**
 * Reactive only (docs/evidence/training.md §5): offered when a lift has stalled for
 * `stallSessions` sessions in a row, never on a schedule.
 */
export const deloadRule: Rule = (data) => {
  if (data.deloadActive) return null;
  const { stallSessions, deloadPct } = data.rules;
  const stalled = data.lifts.find((lift) => {
    const past = lift.sessions.filter((session) => session.sets.some((set) => (set.reps ?? 0) > 0));
    return isStalled(past, stallSessions, deloadPct);
  });
  if (!stalled) return null;

  return {
    kind: 'deload',
    variant: 'deload',
    change: { type: 'deload', pct: deloadPct, stepId: stalled.stepId },
    textKey: 'suggestions.deload.text',
    reasonKey: 'suggestions.deload.reason',
    params: { exercise: stalled.name, sessions: stallSessions, pct: deloadPct },
    evidence: { days: stallSessions, sessions: stallSessions, exercise: stalled.name },
  };
};

/** Priority order (same as `SUGGESTION_KINDS`). */
export const RULES: readonly Rule[] = [
  deloadRule,
  sleepEarlierRule,
  wakeRegularityRule,
  gymDayRule,
  stepsGoalRule,
  waterEarlierRule,
];
