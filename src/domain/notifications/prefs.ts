// "Mis avisos": per-category notification preferences (PLAN §7.1). Pure. Every field is optional
// and a missing one keeps today's behaviour (the template schedule or the built-in offset).
import type { ModuleBody, Schedule } from '../../templates/schema';
import { clockToMinutes } from '../time';

/** Habit id of the "Pausa activa" template habit (shared with the sedentary nudge). */
export const ACTIVE_PAUSE_HABIT_ID = 'pausa-activa';

/** Bounds (also enforced by the settings schema). */
export const EVERY_MIN_MIN = 30;
export const EVERY_MIN_MAX = 180;
export const GYM_BEFORE_MAX = 120;
export const CHECKIN_OFFSET_MAX = 180;
export const SCREENS_OFF_BEFORE_MAX = 180;
/** Screens off at least this long before bed (0 would collide with the bedtime reminder). */
export const SCREENS_OFF_BEFORE_MIN = 5;
export const MAX_QUIET_WINDOWS = 6;

/** Built-in defaults (what the app did before the preferences existed). */
export const DEFAULT_MORNING_OFFSET_MIN = 10;
export const DEFAULT_NIGHT_OFFSET_MIN = 30;
export const DEFAULT_GYM_BEFORE_MIN = 0;
/**
 * Minutes before bed of the bundled template's "Pantallas fuera" reminder (`templates/habitos.json`,
 * `offsetMin: -40`; a test keeps both in step). Shown when the person has not chosen their own.
 */
export const DEFAULT_SCREENS_BEFORE_MIN = 40;

export type RepeatPrefs = {
  enabled?: boolean | undefined;
  /** `HH:mm` of the first reminder (replaces the template's start). */
  from?: string | undefined;
  /** `HH:mm` of the last possible reminder; earlier than `from` crosses midnight. */
  until?: string | undefined;
  /** Minutes between reminders, `EVERY_MIN_MIN`..`EVERY_MIN_MAX`. */
  everyMin?: number | undefined;
  /** Weekdays (0 = Sunday) it runs on. */
  days?: number[] | undefined;
};

export type QuietWindow = { from: string; until: string; days: number[] };

export type CategoryPrefs = {
  water?: RepeatPrefs | undefined;
  gym?: { enabled?: boolean | undefined; minutesBefore?: number | undefined } | undefined;
  morningCheckin?:
    { enabled?: boolean | undefined; offsetAfterWakeMin?: number | undefined } | undefined;
  nightCheckin?:
    { enabled?: boolean | undefined; offsetBeforeBedMin?: number | undefined } | undefined;
  bedtime?: { enabled?: boolean | undefined } | undefined;
  screensOff?: { enabled?: boolean | undefined; minutesBefore?: number | undefined } | undefined;
  activePause?: RepeatPrefs | undefined;
  /** Extra quiet windows on top of bed -> wake. */
  quietHours?: QuietWindow[] | undefined;
};

/** Reminder roles derived from the schedule shape (template-agnostic). */
export type ReminderRole = 'bedtime' | 'screensOff' | 'other';

export function reminderRole(schedule: Schedule): ReminderRole {
  if (schedule.relativeTo !== 'bed' || schedule.time !== undefined) return 'other';
  const offset = schedule.offsetMin ?? 0;
  if (offset === 0) return 'bedtime';
  return offset < 0 ? 'screensOff' : 'other';
}

const isWaterHabit = (habit: NonNullable<ModuleBody['habits']>[number]) =>
  habit.type === 'counter' && typeof habit.target === 'object' && habit.target.formula === 'water';

function repeatSchedule(base: Schedule | undefined, prefs: RepeatPrefs): Schedule | null {
  const custom =
    prefs.from !== undefined ||
    prefs.until !== undefined ||
    prefs.everyMin !== undefined ||
    prefs.days !== undefined;
  if (!custom) return base ?? null;
  if (base === undefined && prefs.from === undefined) return null;
  const start: Pick<Schedule, 'time' | 'relativeTo' | 'offsetMin'> =
    prefs.from !== undefined
      ? { time: prefs.from }
      : {
          ...(base?.time !== undefined ? { time: base.time } : {}),
          ...(base?.relativeTo !== undefined ? { relativeTo: base.relativeTo } : {}),
          ...(base?.offsetMin !== undefined ? { offsetMin: base.offsetMin } : {}),
        };
  const every = prefs.everyMin ?? base?.repeatEveryMin;
  const until = prefs.until ?? base?.until;
  return {
    days: [...(prefs.days ?? base?.days ?? [0, 1, 2, 3, 4, 5, 6])],
    ...start,
    ...(every !== undefined ? { repeatEveryMin: every } : {}),
    ...(until !== undefined ? { until } : {}),
  };
}

type PrefsPass = { times: boolean; remove: boolean };

function transformModules(
  modules: readonly ModuleBody[],
  prefs: CategoryPrefs | undefined,
  pass: PrefsPass,
): ModuleBody[] {
  if (prefs === undefined) return [...modules];
  return modules.map((module) => {
    const habits = (module.habits ?? []).flatMap((habit) => {
      const repeat = isWaterHabit(habit)
        ? prefs.water
        : habit.id === ACTIVE_PAUSE_HABIT_ID
          ? prefs.activePause
          : undefined;
      if (repeat === undefined) return [habit];
      if (pass.remove && repeat.enabled === false) return [];
      if (!pass.times) return [habit];
      const schedule = repeatSchedule(habit.schedules?.[0], repeat);
      if (schedule === null || schedule === habit.schedules?.[0]) return [habit];
      // Only the first schedule is the person's window; any other one stays as the template has it.
      return [{ ...habit, schedules: [schedule, ...(habit.schedules ?? []).slice(1)] }];
    });
    const reminders = (module.reminders ?? []).flatMap((reminder) => {
      const role = reminderRole(reminder.schedule);
      if (pass.remove && role === 'bedtime' && prefs.bedtime?.enabled === false) return [];
      if (role === 'screensOff') {
        if (pass.remove && prefs.screensOff?.enabled === false) return [];
        const before = prefs.screensOff?.minutesBefore;
        if (pass.times && before !== undefined) {
          const offsetMin = -Math.max(before, SCREENS_OFF_BEFORE_MIN);
          return [{ ...reminder, schedule: { ...reminder.schedule, offsetMin } }];
        }
      }
      return [reminder];
    });
    return {
      ...module,
      ...(module.habits ? { habits } : {}),
      ...(module.reminders ? { reminders } : {}),
    };
  });
}

/**
 * The person's TIMES applied to the modules: water / pause windows and the screens-off offset.
 * Shared by Hoy and the notification planner (both go through `buildAgenda`), so the timeline and
 * the notifications can never disagree. Nothing is removed: a category whose notifications are off
 * still belongs to the day.
 */
export function applyCategoryTimes(
  modules: readonly ModuleBody[],
  prefs: CategoryPrefs | undefined,
): ModuleBody[] {
  return transformModules(modules, prefs, { times: true, remove: false });
}

/** Removes the categories whose notifications are switched off (the planner only). */
export function removeDisabledCategories(
  modules: readonly ModuleBody[],
  prefs: CategoryPrefs | undefined,
): ModuleBody[] {
  return transformModules(modules, prefs, { times: false, remove: true });
}

/** Times applied AND disabled categories removed: the modules as the notifications see them. */
export function applyCategoryPrefs(
  modules: readonly ModuleBody[],
  prefs: CategoryPrefs | undefined,
): ModuleBody[] {
  return transformModules(modules, prefs, { times: true, remove: true });
}

/** Check-in offsets from anchors (minutes; the night one is negative = before bed). */
export function checkinOffsets(prefs: CategoryPrefs | undefined): {
  morning: number;
  night: number;
} {
  return {
    morning: prefs?.morningCheckin?.offsetAfterWakeMin ?? DEFAULT_MORNING_OFFSET_MIN,
    night: -(prefs?.nightCheckin?.offsetBeforeBedMin ?? DEFAULT_NIGHT_OFFSET_MIN),
  };
}

/**
 * Whether a local fire time is inside one of the person's quiet windows. `days` are the weekdays
 * a window STARTS on: a window crossing midnight (22:00 -> 06:00 on Friday) also covers the small
 * hours of the next day. `from` is inclusive, `until` exclusive; `from === until` is no window.
 */
export function isInQuietWindow(at: Date, windows: readonly QuietWindow[] | undefined): boolean {
  if (!windows || windows.length === 0) return false;
  const minute = at.getHours() * 60 + at.getMinutes();
  const weekday = at.getDay();
  const yesterday = (weekday + 6) % 7;
  return windows.some((window) => {
    const from = clockToMinutes(window.from);
    const until = clockToMinutes(window.until);
    if (from === until) return false;
    if (from < until) return window.days.includes(weekday) && minute >= from && minute < until;
    return (
      (window.days.includes(weekday) && minute >= from) ||
      (window.days.includes(yesterday) && minute < until)
    );
  });
}

const DAY_MIN = 24 * 60;
/** The last minute a same-day window may end at (a later `until` would cross midnight). */
const LAST_MINUTE = DAY_MIN - 1;

const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The window after the person moved its start to `nextFrom`. When the new start passes the
 * current end, the end moves with it, keeping the original span, so a 08:00-20:00 window moved to
 * 21:00 never becomes a ~23 h series across midnight. The end is capped before bed (`bedMin`,
 * minutes of the day, may be >= 1440) and before midnight.
 */
export function moveWindowStart(
  window: { from: string; until: string },
  nextFrom: string,
  bedMin?: number,
): { from: string; until: string } {
  const from = clockToMinutes(nextFrom);
  const until = clockToMinutes(window.until);
  if (from < until) return { from: nextFrom, until: window.until };
  const span = (until - clockToMinutes(window.from) + DAY_MIN) % DAY_MIN;
  const bedCap = bedMin !== undefined && bedMin > from ? bedMin - 1 : LAST_MINUTE;
  const end = Math.min(from + span, bedCap, LAST_MINUTE);
  return { from: nextFrom, until: toClock(Math.max(end, from)) };
}

/** Whether a window crosses midnight (`until` not after `from`): the screen warns about it. */
export function windowCrossesMidnight(window: { from: string; until: string }): boolean {
  return clockToMinutes(window.until) <= clockToMinutes(window.from);
}
