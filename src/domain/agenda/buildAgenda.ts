// Ordered timeline for the "Hoy" screen (PLAN §13). Pure: everything it needs comes in `state`.
import { getDay } from 'date-fns';

import type {
  Anchors,
  CheckinPrefs,
  GymDays,
  GymPlan,
  Habit,
  ModuleBody,
  Reminder,
  Schedule,
  Step,
} from '../../templates/schema';
import { waterGoal } from '../formulas/water';
import { bedtimeFor } from '../formulas/sleep';
import { effectiveGymPlan } from '../gym/gymPlan';
import { MINUTES_PER_DAY, clockToMinutes, wrapMinutes } from '../time';
import { evaluateOnlyIf, evaluateWhen, type Profile } from './conditions';

export type AgendaKind =
  | 'gym'
  | 'water'
  | 'steps'
  | 'checkin'
  | 'reminder'
  /** Any other habit (pausa activa, caminar después de comer...). */
  | 'habit';

/** What to show: i18n key for built-in items, or the template's own text. */
export type AgendaLabel =
  | { type: 'key'; key: 'agenda.checkin.morning' | 'agenda.checkin.night' | 'agenda.gym' }
  | { type: 'template'; text: string };

export type AgendaItem = {
  /** Stable within a day and unique across modules, e.g. `water:hidratacion:agua`, `checkin:morning`. */
  id: string;
  kind: AgendaKind;
  /**
   * Minute of the day of the first occurrence, `null` for all-day items (steps, untimed habits).
   * Values >= 1440 are after midnight (a late bedtime belongs to the end of today's timeline).
   */
  minutes: number | null;
  /** Every occurrence (repeating schedules, e.g. water every hour); `[minutes]` otherwise. */
  occurrences: number[];
  label: AgendaLabel;
  moduleId?: string;
  habitId?: string;
  /** `habit` / `water` / `steps`: how the template tracks it (only a `check` can be marked done). */
  habitType?: 'check' | 'counter';
  reminderId?: string;
  /** `gym`: today's routine and the steps whose `when` passes. */
  routineId?: string;
  stepIds?: string[];
  /** `water` / `steps`: today's goal. */
  target?: { glasses?: number; ml?: number; steps?: number };
};

export type AgendaState = {
  profile: Profile & { weightKg?: number };
  anchors: Anchors;
  gymDays: GymDays;
  /** Per-day gym times (`gymPlan` setting); without it the times come from the slot anchors. */
  gymPlan?: GymPlan;
  checkinPrefs?: Pick<CheckinPrefs, 'morning' | 'night'>;
  /** Active modules (installed + enabled). */
  modules: readonly ModuleBody[];
  /** Today's routine (from `todaysRoutineId`) with its steps, when a program is installed. */
  todayRoutine?: { id: string; steps: readonly Step[] };
  /** Current step goal (from the steps formulas), if any. */
  stepsGoal?: number;
  /** Accepted suggestions that move the bedtime / water reminders. */
  shifts?: PlanShifts;
  flags?: Readonly<Record<string, boolean>>;
};

const CHECKIN_MORNING_OFFSET = 10;
const CHECKIN_NIGHT_OFFSET = -30;
const GYM_HOURS_PER_SESSION = 1;
/**
 * A derived bedtime whose clock is earlier than the wake clock belongs after midnight (end of
 * today's timeline) ONLY when it falls before this hour. Supported shifts: wake times from the
 * small hours up to ~14:00 with 6-10 h targets (e.g. wake 11:00, 8 h -> bed 03:00 = 27:00). For a
 * shifted day (wake 15:00, 8 h -> bed 07:00) the bed clock is a daytime hour, so it is NOT pushed
 * past midnight and stays 07:00.
 */
const NIGHT_WINDOW_END_MIN = 6 * 60;

/**
 * Plan adjustments accepted from suggestions (negative = EARLIER). `bedMin` moves the planned
 * bedtime before `wake − sleepTargetH`; `waterMin` moves the water reminders earlier.
 */
export type PlanShifts = { bedMin?: number | undefined; waterMin?: number | undefined };

export type AnchorMinutes = Partial<Record<'wake' | 'bed' | 'gymMorning' | 'gymEvening', number>>;

/** Resolves anchors to minutes of the day; `bed` is derived (wake − sleepTargetH). */
export function resolveAnchors(anchors: Anchors, shifts: PlanShifts = {}): AnchorMinutes {
  const result: AnchorMinutes = {};
  if (anchors.wake) result.wake = clockToMinutes(anchors.wake);
  if (anchors.gymMorning) result.gymMorning = clockToMinutes(anchors.gymMorning);
  if (anchors.gymEvening) result.gymEvening = clockToMinutes(anchors.gymEvening);
  if (anchors.wake && anchors.sleepTargetH) {
    let bed = wrapMinutes(
      clockToMinutes(bedtimeFor(anchors.wake, anchors.sleepTargetH)) + (shifts.bedMin ?? 0),
    );
    // Bed earlier on the clock than wake AND in the night window (e.g. bed 00:30, wake 08:00) is
    // after midnight, so it belongs at the end of today's timeline. Otherwise it is the same day.
    if (result.wake !== undefined && bed < result.wake && bed < NIGHT_WINDOW_END_MIN) {
      bed += MINUTES_PER_DAY;
    }
    result.bed = bed;
  }
  return result;
}

/**
 * Anchor + offset, kept inside the day consistently: a negative result wraps to the previous
 * evening's clock (wake 00:30 - 60 -> 23:30) and an overflow past midnight wraps to the small
 * hours. The ONLY value allowed to stay >= 1440 ("after midnight, end of today's timeline") is one
 * derived from `bed`, whose own value may already be past midnight (bed 00:30 + 15 -> 1485).
 */
export function offsetFrom(base: number, offset: number, anchor: keyof AnchorMinutes): number {
  const raw = base + offset;
  if (raw >= 0 && raw < MINUTES_PER_DAY) return raw;
  if (anchor === 'bed' && raw >= MINUTES_PER_DAY && raw < 2 * MINUTES_PER_DAY) return raw;
  return wrapMinutes(raw);
}

function startMinutes(schedule: Schedule, anchors: AnchorMinutes): number | null {
  if (schedule.time !== undefined) return clockToMinutes(schedule.time);
  if (schedule.relativeTo === undefined) return null;
  const base = anchors[schedule.relativeTo];
  return base === undefined ? null : offsetFrom(base, schedule.offsetMin ?? 0, schedule.relativeTo);
}

/** Expands a schedule for `weekday` into its occurrences (empty if it does not apply today). */
function occurrencesOf(schedule: Schedule, weekday: number, anchors: AnchorMinutes): number[] {
  if (!schedule.days.includes(weekday)) return [];
  const start = startMinutes(schedule, anchors);
  if (start === null) return [];
  if (schedule.repeatEveryMin === undefined) return [start];

  // `until` earlier than the start crosses midnight (22:00 -> 02:00 ends at 26:00).
  const limit =
    schedule.until !== undefined
      ? start + wrapMinutes(clockToMinutes(schedule.until) - start)
      : start;
  const times: number[] = [];
  for (let minute = start; minute <= limit; minute += schedule.repeatEveryMin) {
    times.push(minute);
  }
  return times;
}

function habitKind(habit: Habit): AgendaKind {
  if (habit.type === 'counter' && typeof habit.target === 'object') {
    if (habit.target.formula === 'water') return 'water';
    if (habit.target.formula === 'steps') return 'steps';
  }
  return 'habit';
}

/** Water reminders never move closer to the wake time than this (quiet hours end there). */
const WATER_AFTER_WAKE_MIN = 10;

/**
 * Moves a series earlier by `shiftMin` (negative). Nothing goes before `floor` (the earliest
 * sensible time) or before the series' own first occurrence when there is no floor; collisions
 * collapse, so the series may lose its first entries but never gets later.
 */
export function shiftEarlier(
  occurrences: readonly number[],
  shiftMin: number,
  floor?: number,
): number[] {
  if (shiftMin === 0 || occurrences.length === 0) return [...occurrences];
  const first = occurrences[0] ?? 0;
  const lowest = Math.min(first, floor ?? first);
  return [...new Set(occurrences.map((minute) => Math.max(minute + shiftMin, lowest)))].sort(
    (a, b) => a - b,
  );
}

function byTime(a: AgendaItem, b: AgendaItem): number {
  // All-day items (no time) go last; ties keep a stable, readable order by id.
  const left = a.minutes ?? Number.POSITIVE_INFINITY;
  const right = b.minutes ?? Number.POSITIVE_INFINITY;
  if (left !== right) return left < right ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function buildAgenda(date: Date, state: AgendaState): AgendaItem[] {
  const weekday = getDay(date);
  const anchors = resolveAnchors(state.anchors, state.shifts);
  const items: AgendaItem[] = [];

  // Gym: weekdays and per-day times come from settings (`effectiveGymPlan`), not from
  // `program.schedules`.
  const gymToday = effectiveGymPlan({
    gymPlan: state.gymPlan,
    gymDays: state.gymDays,
    anchors: state.anchors,
  }).filter((entry) => entry.weekday === weekday);
  if (gymToday.length > 0) {
    // A migrated day without its slot anchor keeps the item, without a time.
    const occurrences = [
      ...new Set(
        gymToday.flatMap((entry) => (entry.time === undefined ? [] : [clockToMinutes(entry.time)])),
      ),
    ].sort((a, b) => a - b);
    const routine = state.todayRoutine;
    items.push({
      id: 'gym',
      kind: 'gym',
      minutes: occurrences[0] ?? null,
      occurrences,
      label: { type: 'key', key: 'agenda.gym' },
      ...(routine
        ? {
            routineId: routine.id,
            stepIds: routine.steps
              .filter((step) => evaluateWhen(step.when, { weekday, flags: state.flags }))
              .map((step) => step.id),
          }
        : {}),
    });
  }

  // Check-ins: morning at wake + 10, night at bed − 30 (bed is derived).
  const prefs = state.checkinPrefs ?? { morning: true, night: true };
  if (prefs.morning && anchors.wake !== undefined) {
    const minutes = offsetFrom(anchors.wake, CHECKIN_MORNING_OFFSET, 'wake');
    items.push({
      id: 'checkin:morning',
      kind: 'checkin',
      minutes,
      occurrences: [minutes],
      label: { type: 'key', key: 'agenda.checkin.morning' },
    });
  }
  if (prefs.night && anchors.bed !== undefined) {
    const minutes = offsetFrom(anchors.bed, CHECKIN_NIGHT_OFFSET, 'bed');
    items.push({
      id: 'checkin:night',
      kind: 'checkin',
      minutes,
      occurrences: [minutes],
      label: { type: 'key', key: 'agenda.checkin.night' },
    });
  }

  for (const module of state.modules) {
    for (const habit of module.habits ?? []) {
      if (!evaluateOnlyIf(habit.onlyIf, state.profile)) continue;
      const kind = habitKind(habit);
      const base = {
        id: `${kind}:${module.id}:${habit.id}`,
        kind,
        label: { type: 'template' as const, text: habit.name },
        moduleId: module.id,
        habitId: habit.id,
        habitType: habit.type,
      };

      const times = (habit.schedules ?? []).flatMap((schedule) =>
        occurrencesOf(schedule, weekday, anchors),
      );
      // A habit that has schedules but none applies today is not part of today's timeline.
      if ((habit.schedules?.length ?? 0) > 0 && times.length === 0) continue;
      const sorted = shiftEarlier(
        [...new Set(times)].sort((a, b) => a - b),
        kind === 'water' ? (state.shifts?.waterMin ?? 0) : 0,
        anchors.wake !== undefined ? anchors.wake + WATER_AFTER_WAKE_MIN : undefined,
      );

      const target =
        kind === 'water' && state.profile.weightKg !== undefined
          ? (() => {
              const goal = waterGoal({
                weightKg: state.profile.weightKg,
                gymHours: gymToday.length * GYM_HOURS_PER_SESSION,
                glassMl: habit.type === 'counter' ? habit.glassMl : undefined,
              });
              return { glasses: goal.glasses, ml: goal.ml };
            })()
          : kind === 'steps' && state.stepsGoal !== undefined
            ? { steps: state.stepsGoal }
            : undefined;

      items.push({
        ...base,
        minutes: sorted[0] ?? null,
        occurrences: sorted,
        ...(target ? { target } : {}),
      });
    }

    // Reminders (bedtime wind-down, "hora de dormir"...) with absolute or relative schedules.
    for (const reminder of module.reminders ?? ([] as Reminder[])) {
      const times = occurrencesOf(reminder.schedule, weekday, anchors);
      if (times.length === 0) continue;
      items.push({
        id: `reminder:${module.id}:${reminder.id}`,
        kind: 'reminder',
        minutes: times[0] ?? null,
        occurrences: times,
        label: { type: 'template', text: reminder.text },
        moduleId: module.id,
        reminderId: reminder.id,
      });
    }
  }

  return items.sort(byTime);
}
