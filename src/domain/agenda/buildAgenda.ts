// Ordered timeline for the "Hoy" screen (PLAN §13). Pure: everything it needs comes in `state`.
import { getDay } from 'date-fns';

import type {
  Anchors,
  CheckinPrefs,
  GymDays,
  Habit,
  ModuleBody,
  Reminder,
  Schedule,
  Step,
} from '../../templates/schema';
import { waterGoal } from '../formulas/water';
import { bedtimeFor } from '../formulas/sleep';
import { MINUTES_PER_DAY, clockToMinutes } from '../time';
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
  /** Stable within a day, e.g. `water:agua`, `checkin:morning`. */
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
  checkinPrefs?: Pick<CheckinPrefs, 'morning' | 'night'>;
  /** Active modules (installed + enabled). */
  modules: readonly ModuleBody[];
  /** Today's routine (from `todaysRoutineId`) with its steps, when a program is installed. */
  todayRoutine?: { id: string; steps: readonly Step[] };
  /** Current step goal (from the steps formulas), if any. */
  stepsGoal?: number;
  flags?: Readonly<Record<string, boolean>>;
};

const CHECKIN_MORNING_OFFSET = 10;
const CHECKIN_NIGHT_OFFSET = -30;
const GYM_HOURS_PER_SESSION = 1;

type AnchorMinutes = Partial<Record<'wake' | 'bed' | 'gymMorning' | 'gymEvening', number>>;

/** Resolves anchors to minutes of the day; `bed` is derived (wake − sleepTargetH). */
function resolveAnchors(anchors: Anchors): AnchorMinutes {
  const result: AnchorMinutes = {};
  if (anchors.wake) result.wake = clockToMinutes(anchors.wake);
  if (anchors.gymMorning) result.gymMorning = clockToMinutes(anchors.gymMorning);
  if (anchors.gymEvening) result.gymEvening = clockToMinutes(anchors.gymEvening);
  if (anchors.wake && anchors.sleepTargetH) {
    let bed = clockToMinutes(bedtimeFor(anchors.wake, anchors.sleepTargetH));
    // Bed earlier on the clock than wake (e.g. bed 00:30, wake 08:00) is after midnight, so it
    // belongs at the end of today's timeline. Otherwise it is the same evening.
    if (result.wake !== undefined && bed < result.wake) bed += MINUTES_PER_DAY;
    result.bed = bed;
  }
  return result;
}

function startMinutes(schedule: Schedule, anchors: AnchorMinutes): number | null {
  if (schedule.time !== undefined) return clockToMinutes(schedule.time);
  if (schedule.relativeTo === undefined) return null;
  const base = anchors[schedule.relativeTo];
  return base === undefined ? null : base + (schedule.offsetMin ?? 0);
}

/** Expands a schedule for `weekday` into its occurrences (empty if it does not apply today). */
function occurrencesOf(schedule: Schedule, weekday: number, anchors: AnchorMinutes): number[] {
  if (!schedule.days.includes(weekday)) return [];
  const start = startMinutes(schedule, anchors);
  if (start === null) return [];
  if (schedule.repeatEveryMin === undefined) return [start];

  const limit = schedule.until !== undefined ? clockToMinutes(schedule.until) : start;
  const times: number[] = [];
  for (let minute = start; minute <= Math.max(limit, start); minute += schedule.repeatEveryMin) {
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

function byTime(a: AgendaItem, b: AgendaItem): number {
  // All-day items (no time) go last; ties keep a stable, readable order by id.
  const left = a.minutes ?? Number.POSITIVE_INFINITY;
  const right = b.minutes ?? Number.POSITIVE_INFINITY;
  if (left !== right) return left < right ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function buildAgenda(date: Date, state: AgendaState): AgendaItem[] {
  const weekday = getDay(date);
  const anchors = resolveAnchors(state.anchors);
  const items: AgendaItem[] = [];

  // Gym: days and anchors come from settings (onboarding), not from `program.schedules`.
  const gymToday = state.gymDays.find((entry) => entry.days.includes(weekday));
  if (gymToday) {
    const minutes = anchors[gymToday.anchor] ?? null;
    const routine = state.todayRoutine;
    items.push({
      id: 'gym',
      kind: 'gym',
      minutes,
      occurrences: minutes === null ? [] : [minutes],
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
    const minutes = anchors.wake + CHECKIN_MORNING_OFFSET;
    items.push({
      id: 'checkin:morning',
      kind: 'checkin',
      minutes,
      occurrences: [minutes],
      label: { type: 'key', key: 'agenda.checkin.morning' },
    });
  }
  if (prefs.night && anchors.bed !== undefined) {
    const minutes = anchors.bed + CHECKIN_NIGHT_OFFSET;
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
        id: `${kind}:${habit.id}`,
        kind,
        label: { type: 'template' as const, text: habit.name },
        moduleId: module.id,
        habitId: habit.id,
      };

      const times = (habit.schedules ?? []).flatMap((schedule) =>
        occurrencesOf(schedule, weekday, anchors),
      );
      // A habit that has schedules but none applies today is not part of today's timeline.
      if ((habit.schedules?.length ?? 0) > 0 && times.length === 0) continue;
      const sorted = [...new Set(times)].sort((a, b) => a - b);

      const target =
        kind === 'water' && state.profile.weightKg !== undefined
          ? (() => {
              const goal = waterGoal({
                weightKg: state.profile.weightKg,
                gymHours: gymToday ? GYM_HOURS_PER_SESSION : 0,
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
        id: `reminder:${reminder.id}`,
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
