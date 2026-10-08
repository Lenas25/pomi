// The notifications Pomi wants scheduled in the next few days (PLAN §7.1). Pure: the agenda of
// each day (`buildAgenda`) plus the extra prompts (survey, weekly review) become a flat list with
// STABLE ids, so the scheduler can diff it against what the OS already holds.
import { addDays, format, getDay } from 'date-fns';

import type { Habit } from '../../templates/schema';
import {
  buildAgenda,
  offsetFrom,
  resolveAnchors,
  type AgendaItem,
  type AgendaState,
} from '../agenda/buildAgenda';
import { clockToMinutes, dayKeyFor, dayStartFor } from '../time';

/** The OS keeps at most this many scheduled notifications (iOS limit; Android OEMs cap too). */
export const MAX_SCHEDULED = 64;
export const WINDOW_DAYS = 3;
/** The "¿Te moviste hoy?" survey when the bedtime is unknown. */
export const DEFAULT_SURVEY_MINUTES = 20 * 60;
/** Minutes before bed at which the survey is sent by default. */
export const SURVEY_BEFORE_BED_MIN = 90;
export const WEEKLY_REVIEW_MINUTES = 18 * 60;
/** The monthly review needs daylight for the photos: 10:00 on its day. */
export const MONTHLY_REVIEW_MINUTES = 10 * 60;
export const DEFAULT_MONTHLY_REVIEW_DAY = 1;
export const SUNDAY = 0;
/** BRAND §9 limits for notification text. */
export const TITLE_MAX = 30;
export const BODY_MAX = 80;

export type NotificationKind =
  'gym' | 'water' | 'habit' | 'checkin' | 'reminder' | 'review' | 'monthly' | 'survey';

/** Android channels of planned notifications (timers have their own, outside this list). */
export type PlannedChannel = 'gym' | 'habits' | 'checkins' | 'reminders' | 'review';

/** Interactive categories (ids avoid `:` and `-`, as the Expo docs ask). */
export type CategoryId = 'pomi_habit' | 'pomi_water' | 'pomi_survey' | 'pomi_snooze';

/** i18n keys (under `notify.`) of the built-in texts. */
export type NotifyTextKey =
  | 'notify.gym'
  | 'notify.checkinMorning'
  | 'notify.checkinNight'
  | 'notify.review'
  | 'notify.monthly'
  | 'notify.survey'
  | 'notify.habit'
  | 'notify.reminder';

export type PlannedText =
  | { type: 'key'; key: NotifyTextKey; params?: Record<string, string | number> }
  | { type: 'text'; title: string; body: string };

export type NotificationData = {
  kind: NotificationKind;
  /** Day the notification fires, `yyyy-MM-dd`. */
  date: string;
  moduleId?: string;
  habitId?: string;
  reminderId?: string;
  checkin?: 'morning' | 'night';
};

export type PlannedNotification = {
  /** `kind:module:item:yyyy-MM-dd:HH:mm` (local fire date and time). */
  id: string;
  /** Epoch ms of the fire time. */
  at: number;
  kind: NotificationKind;
  channel: PlannedChannel;
  category: CategoryId | null;
  text: PlannedText;
  data: NotificationData;
};

export type UpcomingState = AgendaState & {
  /** "¿Te moviste hoy?" on/off (default on). */
  surveyEnabled?: boolean;
  /** Fixed `HH:mm` for the survey; default = bed − 90 min (20:00 without a bedtime). */
  surveyTime?: string;
  /** Sunday review on/off (default on). */
  weeklyReviewEnabled?: boolean;
  /** Monthly review on/off (default on) and its day of the month (default 1). */
  monthlyReviewEnabled?: boolean;
  monthlyReviewDay?: number;
  /** What is already done TODAY (later days are never affected). */
  today: {
    /** An activity answer exists, or a gym session was finished. */
    activityLogged: boolean;
    gymDone: boolean;
    checkinsDone: { morning: boolean; night: boolean };
    /** Agenda item ids that are complete (e.g. the water goal reached): their reminders stop. */
    doneAgendaIds: readonly string[];
    /** A monthly check-in already exists for the current month. */
    monthlyDone?: boolean;
  };
};

/** Lower rank = kept first when the list is trimmed. */
const RANK: Record<NotificationKind, number> = {
  checkin: 0,
  survey: 1,
  gym: 2,
  review: 3,
  monthly: 3,
  reminder: 4,
  habit: 5,
  water: 6,
};

/** Shortens text to `max` characters with an ellipsis (template texts can be arbitrarily long). */
export function clampText(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length <= max
    ? chars.join('')
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

function atMinutes(day: Date, minutes: number): number {
  // Minutes >= 1440 roll over into the next calendar day (the Date constructor normalizes them).
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
}

function stableId(kind: NotificationKind, moduleId: string, itemId: string, at: number): string {
  return `${kind}:${moduleId}:${itemId}:${format(at, 'yyyy-MM-dd:HH:mm')}`;
}

/**
 * Quiet hours run from bed (exclusive: the "time to sleep" reminder still goes out) to wake
 * (exclusive). Without both anchors there are none.
 */
export function isQuietMinute(
  minuteOfDay: number,
  bed: number | undefined,
  wake: number | undefined,
) {
  if (bed === undefined || wake === undefined) return false;
  const bedClock = bed % 1440;
  if (bedClock === wake) return false;
  return bedClock < wake
    ? minuteOfDay > bedClock && minuteOfDay < wake
    : minuteOfDay > bedClock || minuteOfDay < wake;
}

function findHabit(state: AgendaState, item: AgendaItem): Habit | undefined {
  return state.modules
    .find((module) => module.id === item.moduleId)
    ?.habits?.find((habit) => habit.id === item.habitId);
}

function habitCategory(habit: Habit | undefined, item: AgendaItem): CategoryId {
  if (item.kind === 'water') return 'pomi_water';
  return habit?.type === 'check' ? 'pomi_habit' : 'pomi_snooze';
}

function habitText(habit: Habit | undefined, item: AgendaItem): PlannedText {
  if (habit?.notification) {
    return {
      type: 'text',
      title: clampText(habit.notification.title, TITLE_MAX),
      body: clampText(habit.notification.body, BODY_MAX),
    };
  }
  const name = item.label.type === 'template' ? item.label.text : '';
  return { type: 'key', key: 'notify.habit', params: { name: clampText(name, TITLE_MAX) } };
}

type Candidate = { planned: PlannedNotification; dayIndex: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Notifications from `from` up to `from + days × 24 h` (a rolling window, not calendar days, so an
 * evening open still plans about three days), quiet hours removed, ordered by time and trimmed to
 * `MAX_SCHEDULED` (earlier days and higher priority kinds win the slots).
 */
export function buildUpcoming(
  state: UpcomingState,
  from: Date,
  days: number = WINDOW_DAYS,
): PlannedNotification[] {
  const anchors = resolveAnchors(state.anchors, state.shifts);
  const candidates: Candidate[] = [];
  // Day 0 is the logical day in progress (before 04:00 it is still yesterday).
  const first = dayStartFor(from);
  const fromMs = from.getTime();
  const untilMs = fromMs + days * DAY_MS;

  // One extra logical day: the window ends mid-day, so the last day is only partly inside it.
  for (let dayIndex = 0; dayIndex <= days; dayIndex += 1) {
    const day = addDays(first, dayIndex);
    const isToday = dayIndex === 0;
    const agenda = buildAgenda(day, isToday ? state : { ...state, todayRoutine: undefined });
    const add = (
      kind: NotificationKind,
      moduleId: string,
      itemId: string,
      minutes: number,
      rest: Omit<PlannedNotification, 'id' | 'at' | 'kind' | 'data'> & {
        data?: Partial<NotificationData>;
      },
    ) => {
      const at = atMinutes(day, minutes);
      const { data, ...fields } = rest;
      candidates.push({
        planned: {
          ...fields,
          id: stableId(kind, moduleId, itemId, at),
          at,
          kind,
          data: { ...data, kind, date: dayKeyFor(new Date(at)) },
        },
        dayIndex,
      });
    };

    for (const item of agenda) {
      if (isToday && state.today.doneAgendaIds.includes(item.id)) continue;

      if (item.kind === 'gym') {
        if (isToday && state.today.gymDone) continue;
        for (const minutes of item.occurrences) {
          add('gym', 'core', 'gym', minutes, {
            channel: 'gym',
            category: 'pomi_snooze',
            text: { type: 'key', key: 'notify.gym' },
          });
        }
      } else if (item.kind === 'checkin') {
        const which = item.id === 'checkin:morning' ? 'morning' : 'night';
        if (isToday && state.today.checkinsDone[which]) continue;
        for (const minutes of item.occurrences) {
          add('checkin', 'core', which, minutes, {
            channel: 'checkins',
            category: null,
            text: {
              type: 'key',
              key: which === 'morning' ? 'notify.checkinMorning' : 'notify.checkinNight',
            },
            data: { checkin: which },
          });
        }
      } else if (item.kind === 'reminder') {
        const text = item.label.type === 'template' ? item.label.text : '';
        for (const minutes of item.occurrences) {
          add('reminder', item.moduleId ?? 'core', item.reminderId ?? item.id, minutes, {
            channel: 'reminders',
            category: 'pomi_snooze',
            text: {
              type: 'key',
              key: 'notify.reminder',
              params: { text: clampText(text, BODY_MAX) },
            },
            data: {
              ...(item.moduleId ? { moduleId: item.moduleId } : {}),
              reminderId: item.reminderId ?? '',
            },
          });
        }
      } else if (item.kind === 'water' || item.kind === 'habit') {
        const habit = findHabit(state, item);
        for (const minutes of item.occurrences) {
          add(item.kind, item.moduleId ?? 'core', item.habitId ?? item.id, minutes, {
            channel: 'habits',
            category: habitCategory(habit, item),
            text: habitText(habit, item),
            data: {
              ...(item.moduleId ? { moduleId: item.moduleId } : {}),
              ...(item.habitId ? { habitId: item.habitId } : {}),
            },
          });
        }
      }
    }

    // "¿Te moviste hoy?": skipped when today already has an answer or a finished workout.
    if ((state.surveyEnabled ?? true) && !(isToday && state.today.activityLogged)) {
      const minutes =
        state.surveyTime !== undefined
          ? clockToMinutes(state.surveyTime)
          : anchors.bed !== undefined
            ? offsetFrom(anchors.bed, -SURVEY_BEFORE_BED_MIN, 'bed')
            : DEFAULT_SURVEY_MINUTES;
      add('survey', 'core', 'activity', minutes, {
        channel: 'checkins',
        category: 'pomi_survey',
        text: { type: 'key', key: 'notify.survey' },
      });
    }

    if ((state.weeklyReviewEnabled ?? true) && getDay(day) === SUNDAY) {
      add('review', 'core', 'weekly', WEEKLY_REVIEW_MINUTES, {
        channel: 'review',
        category: null,
        text: { type: 'key', key: 'notify.review' },
      });
    }

    // Once a month, on the configured day, unless this month's review is already done.
    if (
      (state.monthlyReviewEnabled ?? true) &&
      day.getDate() === (state.monthlyReviewDay ?? DEFAULT_MONTHLY_REVIEW_DAY) &&
      !(isToday && state.today.monthlyDone === true)
    ) {
      add('monthly', 'core', 'review', MONTHLY_REVIEW_MINUTES, {
        channel: 'review',
        category: null,
        text: { type: 'key', key: 'notify.monthly' },
      });
    }
  }

  const upcoming = candidates.filter(({ planned }) => {
    if (planned.at <= fromMs || planned.at > untilMs) return false;
    const date = new Date(planned.at);
    return !isQuietMinute(date.getHours() * 60 + date.getMinutes(), anchors.bed, anchors.wake);
  });

  // Earlier days first, then priority, then time; whatever does not fit in 64 is dropped.
  const kept = [...upcoming]
    .sort(
      (a, b) =>
        a.dayIndex - b.dayIndex ||
        RANK[a.planned.kind] - RANK[b.planned.kind] ||
        a.planned.at - b.planned.at ||
        a.planned.id.localeCompare(b.planned.id),
    )
    .slice(0, MAX_SCHEDULED);

  const unique = new Map(kept.map(({ planned }) => [planned.id, planned]));
  return [...unique.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
