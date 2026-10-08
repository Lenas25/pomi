// Sedentary nudge (PLAN §14b): "Pausa activa" when the last N minutes have fewer steps than a
// threshold, awake, on the chosen days. Pure: the background task reads the clock, the settings and
// Health Connect and passes them in. The nudge never insists: a cap per day, a cooldown, and every
// doubt (no permission, no data, switch off, phone left behind) means NO nudge.
import { getDay, parseISO } from 'date-fns';

import { isInQuietWindow, type QuietWindow } from '../notifications/prefs';
import { dayKeyFor, minutesIntoDay } from '../time';

export const WINDOW_OPTIONS_MIN = [60, 90, 120] as const;
export type NudgeWindowMin = (typeof WINDOW_OPTIONS_MIN)[number];

export type SedentaryConfig = {
  /** Off until the person turns it on (and Health Connect is connected). */
  enabled: boolean;
  /** Look-back window in minutes. */
  windowMin: NudgeWindowMin;
  /** Fewer steps than this in the window = a long sit. */
  threshold: number;
  /** Weekdays (0 = Sunday) the nudge may appear. */
  days: readonly number[];
  /** Most nudges per day. */
  maxPerDay: number;
  /** "No llevo el celular cuando camino": the phone's steps do not show movement, so no nudge. */
  noPhone: boolean;
};

export const DEFAULT_SEDENTARY: SedentaryConfig = {
  enabled: false,
  windowMin: 90,
  threshold: 100,
  days: [1, 2, 3, 4, 5],
  maxPerDay: 3,
  noPhone: false,
};

/** The window starts this long after waking and ends this long before bed (PLAN §14b defaults). */
export const AFTER_WAKE_MIN = 60;
export const BEFORE_BED_MIN = 120;
/** Never two nudges closer than this, whatever the window is. */
export const MIN_COOLDOWN_MIN = 120;

/** What the person did with the nudges so far (stored between runs). */
export type NudgeHistory = {
  /** Logical day of `count`. */
  date: string;
  /** Nudges sent on `date`. */
  count: number;
  /** Epoch ms of the last nudge (it survives midnight, for the cooldown). */
  lastAt?: number | undefined;
};

/** Steps of the last `windowMin` minutes, as Health Connect reported them. */
export type StepsReading = {
  steps: number;
  /** Health Connect delivered step records recently: without them zero steps means nothing. */
  hasRecentData: boolean;
};

export type NudgeState = {
  config: SedentaryConfig;
  /** Health Connect: steps read permission AND background access granted. */
  permission: boolean;
  /** Wake and bed in minutes of the logical day (bed may be >= 1440). */
  wakeMin: number | undefined;
  bedMin: number | undefined;
  history: NudgeHistory | undefined;
  /** `null`/`undefined`: not read, or the read failed. */
  reading: StepsReading | null | undefined;
  /** "Mis avisos" quiet windows: nothing sounds inside them, the nudge included. */
  quietWindows?: readonly QuietWindow[] | undefined;
};

export type NudgeReason =
  | 'send'
  | 'disabled'
  | 'noPhone'
  | 'noPermission'
  | 'noPlan'
  | 'dayNotSelected'
  | 'quietHours'
  | 'dailyCap'
  | 'cooldown'
  | 'noData'
  | 'enough';

export type NudgeDecision = { send: boolean; reason: NudgeReason };

const no = (reason: NudgeReason): NudgeDecision => ({ send: false, reason });

/** Everything that can be decided WITHOUT reading Health Connect (the task skips the read on `no`). */
export function canNudgeNow(state: NudgeState, now: Date): NudgeDecision {
  const { config } = state;
  if (!config.enabled) return no('disabled');
  if (config.noPhone) return no('noPhone');
  if (!state.permission) return no('noPermission');
  if (state.wakeMin === undefined || state.bedMin === undefined) return no('noPlan');

  const day = dayKeyFor(now);
  if (!config.days.includes(getDay(parseISO(day)))) return no('dayNotSelected');

  // Awake and out of quiet hours (bed -> wake): from wake + 1 h to bed - 2 h.
  const minute = minutesIntoDay(now);
  const from = state.wakeMin + AFTER_WAKE_MIN;
  const to = state.bedMin - BEFORE_BED_MIN;
  if (minute < from || minute > to) return no('quietHours');
  if (isInQuietWindow(now, state.quietWindows)) return no('quietHours');

  const history = state.history;
  const sentToday = history && history.date === day ? history.count : 0;
  if (sentToday >= config.maxPerDay) return no('dailyCap');

  const cooldownMs = Math.max(config.windowMin, MIN_COOLDOWN_MIN) * 60_000;
  if (history?.lastAt !== undefined && now.getTime() - history.lastAt < cooldownMs) {
    return no('cooldown');
  }
  return { send: true, reason: 'send' };
}

/**
 * Whether to show the "Pausa activa" nudge now. Strictly fewer steps than the threshold in the
 * window, with Health Connect data present. No data is NOT inactivity: a phone that did not report
 * anything may simply be somewhere else.
 */
export function shouldNudge(state: NudgeState, now: Date): NudgeDecision {
  const pre = canNudgeNow(state, now);
  if (!pre.send) return pre;
  const reading = state.reading;
  if (!reading || !reading.hasRecentData) return no('noData');
  return reading.steps < state.config.threshold ? pre : no('enough');
}

/** The history after a nudge was sent at `now`. */
export function recordNudge(history: NudgeHistory | undefined, now: Date): NudgeHistory {
  const day = dayKeyFor(now);
  const count = history && history.date === day ? history.count : 0;
  return { date: day, count: count + 1, lastAt: now.getTime() };
}
