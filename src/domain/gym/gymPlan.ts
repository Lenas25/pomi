// The per-day gym model. Stored as `gymPlan` ({weekday, time}[]; a weekday may appear twice for a
// morning AND evening session); stores written before it existed only have `gymDays` (weekdays
// grouped by a morning/evening slot) + the slot anchors.
import { addDays, format, getDay, parseISO, subDays } from 'date-fns';

import { clockToMinutes } from '../time';
import type { Anchors, GymDays, GymPlan } from '../../templates/schema';

/**
 * One-week overrides of the usual plan, set in the weekly review ("Planifica tu semana"), keyed by
 * the Monday (`yyyy-MM-dd`, a logical day key) of the ISO week they apply to. An empty plan means
 * "no gym this week" (planned off, never "missed").
 */
export type GymWeekPlans = Record<string, GymPlan>;

/** Weeks of overrides kept before the current one (insights and reviews look back at most this far). */
export const GYM_WEEK_PLANS_KEEP_WEEKS = 8;

type GymSlot = 'gymMorning' | 'gymEvening';

const EVENING_FROM_MIN = 12 * 60;

/** One planned session. `time` is absent only for a migrated day whose slot anchor is missing. */
export type EffectiveGymDay = { weekday: number; time?: string };

/**
 * Slot a clock time belongs to when the plan is projected back onto `gymDays`: the slot whose
 * anchor is exactly that time, else morning before 12:00 and evening from 12:00.
 */
export function slotForTime(time: string, anchors?: Anchors): GymSlot {
  if (anchors?.gymMorning === time) return 'gymMorning';
  if (anchors?.gymEvening === time) return 'gymEvening';
  return clockToMinutes(time) < EVENING_FROM_MIN ? 'gymMorning' : 'gymEvening';
}

/**
 * `gymDays` projected from a plan: the weekday sets the weekday-only readers use. A weekday with
 * two sessions in the same slot still projects to BOTH slots (earlier = morning, later =
 * evening), so a reader counting sessions from `gymDays` sees two.
 */
export function gymDaysFromPlan(plan: GymPlan, anchors?: Anchors): GymDays {
  const bySlot: Record<GymSlot, Set<number>> = { gymMorning: new Set(), gymEvening: new Set() };
  const byDay = new Map<number, string[]>();
  for (const entry of plan)
    byDay.set(entry.weekday, [...(byDay.get(entry.weekday) ?? []), entry.time]);
  for (const [weekday, times] of byDay) {
    const sorted = [...times].sort();
    const slots = sorted.map((time) => slotForTime(time, anchors));
    if (sorted.length >= 2 && new Set(slots).size === 1) {
      bySlot.gymMorning.add(weekday);
      bySlot.gymEvening.add(weekday);
      continue;
    }
    for (const slot of slots) bySlot[slot].add(weekday);
  }
  const days = (slot: GymSlot) => [...bySlot[slot]].sort((a, b) => a - b);
  const result: GymDays = [];
  const morning = days('gymMorning');
  const evening = days('gymEvening');
  if (morning.length > 0) result.push({ days: morning, anchor: 'gymMorning' });
  if (evening.length > 0) result.push({ days: evening, anchor: 'gymEvening' });
  return result;
}

/** Canonical order: weekday, then time. */
export function sortGymPlan<T extends EffectiveGymDay>(plan: readonly T[]): T[] {
  return [...plan].sort(
    (a, b) => a.weekday - b.weekday || (a.time ?? '').localeCompare(b.time ?? ''),
  );
}

/** Monday (`yyyy-MM-dd`) of the ISO week of a logical day key (use `dayKeyFor` to get one). */
export function gymWeekStart(day: string): string {
  const date = parseISO(day);
  return format(subDays(date, (getDay(date) + 6) % 7), 'yyyy-MM-dd');
}

/** Whether a `yyyy-MM-dd` key is a real calendar date that falls on a Monday. */
export function isIsoMonday(day: string): boolean {
  const date = parseISO(day);
  return !Number.isNaN(date.getTime()) && format(date, 'yyyy-MM-dd') === day && getDay(date) === 1;
}

/**
 * The week the review plans: on Sunday the week that starts tomorrow, any other day the current
 * one (the review is reachable from Hoy on Sunday AND Monday).
 */
export function planningWeekStart(today: string): string {
  return gymWeekStart(format(addDays(parseISO(today), 1), 'yyyy-MM-dd'));
}

/** Drops overrides older than `GYM_WEEK_PLANS_KEEP_WEEKS` weeks before the week of `today`. */
export function pruneGymWeekPlans(plans: GymWeekPlans, today: string): GymWeekPlans {
  const cutoff = format(
    subDays(parseISO(gymWeekStart(today)), GYM_WEEK_PLANS_KEEP_WEEKS * 7),
    'yyyy-MM-dd',
  );
  return Object.fromEntries(Object.entries(plans).filter(([week]) => week >= cutoff));
}

export type GymPlanSettings = {
  gymPlan?: GymPlan | undefined;
  gymDays?: GymDays | undefined;
  anchors?: Anchors | undefined;
  gymWeekPlans?: GymWeekPlans | undefined;
};

/**
 * The plan for the week of `date` (logical day key): that week's override when there is one,
 * else the usual plan (`usualGymPlan`). Without a date it is always the usual plan.
 */
export function effectiveGymPlan(input: GymPlanSettings, date?: string): EffectiveGymDay[] {
  const override = date === undefined ? undefined : input.gymWeekPlans?.[gymWeekStart(date)];
  return override ? sortGymPlan(override) : usualGymPlan(input);
}

/** Whether a gym session is planned on `date` (logical day key), override-aware. */
export function isGymPlannedOn(input: GymPlanSettings, date: string): boolean {
  const weekday = getDay(parseISO(date));
  return effectiveGymPlan(input, date).some((entry) => entry.weekday === weekday);
}

/** Distinct planned weekdays of the week of `date`, override-aware. */
export function plannedGymWeekdays(input: GymPlanSettings, date: string): Set<number> {
  return new Set(effectiveGymPlan(input, date).map((entry) => entry.weekday));
}

/**
 * The usual gym plan (no week override). `gymDays` stays the source of WHICH weekdays (an
 * accepted suggestion edits it); times come from `gymPlan` where the weekday matches, a moved day
 * inherits the time of the day it replaced, and anything else falls back to its slot anchor (the
 * migration of old stores and backups).
 */
export function usualGymPlan(input: GymPlanSettings): EffectiveGymDay[] {
  const stored = new Map<number, string[]>();
  for (const entry of input.gymPlan ?? []) {
    stored.set(entry.weekday, [...(stored.get(entry.weekday) ?? []), entry.time]);
  }
  if (input.gymDays === undefined) return sortGymPlan(input.gymPlan ?? []);

  const wanted = new Map<number, Set<GymSlot>>();
  for (const entry of input.gymDays) {
    for (const day of entry.days) wanted.set(day, (wanted.get(day) ?? new Set()).add(entry.anchor));
  }
  // Times of plan days that `gymDays` dropped: a moved day takes the first of them.
  const freed = [...stored.keys()]
    .filter((day) => !wanted.has(day))
    .sort((a, b) => a - b)
    .flatMap((day) => stored.get(day) ?? []);
  const plan: EffectiveGymDay[] = [];
  for (const [weekday, slots] of wanted) {
    const times = stored.get(weekday) ?? [];
    for (const time of times) plan.push({ weekday, time });
    // More slots than stored times (an old plan, or `gymDays` gained a slot): the remaining
    // slots get a freed time when the weekday is new, else their anchor.
    const covered = new Set(times.map((time) => slotForTime(time, input.anchors)));
    const missing = [...slots].filter((slot) => !covered.has(slot));
    for (const slot of missing.slice(0, Math.max(0, slots.size - times.length))) {
      const time = (times.length === 0 ? freed.shift() : undefined) ?? input.anchors?.[slot];
      plan.push(time === undefined ? { weekday } : { weekday, time });
    }
  }
  return sortGymPlan(plan);
}
