// Identifiers shared by the scheduler, the categories and the response handler.
import type { CategoryId, PlannedChannel } from '../domain/notifications/buildUpcoming';

/** Android channel ids of the planned notifications (`timers` lives in `src/timers`). */
export const CHANNEL_IDS: Record<PlannedChannel, string> = {
  gym: 'gym',
  habits: 'habits',
  checkins: 'checkins',
  reminders: 'reminders',
};

/** Action identifiers (no `:` or `-`, see the expo-notifications docs on categories). */
export const ACTIONS = {
  done: 'pomi_done',
  snooze: 'pomi_snooze',
  addWater: 'pomi_water_add',
  gym: 'pomi_act_gym',
  walk: 'pomi_act_walk',
  none: 'pomi_act_none',
} as const;

export const CATEGORY_IDS: readonly CategoryId[] = [
  'pomi_habit',
  'pomi_water',
  'pomi_survey',
  'pomi_snooze',
];

export const SNOOZE_MINUTES = 10;
/** Marks the notifications Pomi plans (the foreground handler always shows them). */
export const SOURCE = 'pomi';

/** The payload Pomi stores in `content.data` of every planned notification. */
export type PlannedPayload = {
  source: typeof SOURCE;
  kind: string;
  channel: PlannedChannel;
  date: string;
  /** Signature used by the diff: when it changes, the notification is scheduled again. */
  sig: string;
  moduleId?: string;
  habitId?: string;
  reminderId?: string;
  checkin?: 'morning' | 'night';
};
