// Bounds and thresholds of the suggestions engine (PLAN §11).

/** At most this many NEW suggestions per ISO week (PLAN §2: suggest, never impose). */
export const MAX_NEW_PER_WEEK = 2;
/** A rejected kind is not offered again for four weeks. */
export const REJECT_BLOCK_DAYS = 28;
/** After an accepted one, the same kind waits a week to let the change show its effect. */
export const ACCEPT_COOLDOWN_DAYS = 7;

/** Bedtime moves in 15 minute steps, never more than an hour in total. */
export const BED_STEP_MIN = 15;
export const BED_SHIFT_LIMIT_MIN = -60;
/** Water reminders move in 30 minute steps, never more than two hours in total. */
export const WATER_STEP_MIN = 30;
export const WATER_SHIFT_LIMIT_MIN = -120;

/** Fewest morning check-ins (of the last 7 days) the sleep rules accept. */
export const MIN_SLEEP_DAYS = 4;
/** Average sleep this far below the target triggers "dormir antes". */
export const SLEEP_SHORT_BY_MIN = 30;
/** Wake times that vary by more than this trigger "regularidad". */
export const WAKE_RANGE_MIN = 60;
/** No wake suggestion when the median is this close to the plan's wake time. */
export const WAKE_ANCHOR_TOLERANCE_MIN = 15;

export const STEPS_MIN_DATA_DAYS = 5;

/** Water: under 60% of the goal at 18:00 on at least 5 of the last 7 days. */
export const WATER_HOUR = 18;
export const WATER_SHORT_FRACTION = 0.6;
export const WATER_SHORT_DAYS = 5;
export const WATER_WINDOW_DAYS = 7;

/** Gym day: the same weekday missed 3 times in 4 weeks. */
export const GYM_WEEKS = 4;
export const GYM_MISSED = 3;

/** A pending suggestion that nobody answered expires after a week (the data it used is stale). */
export const PENDING_EXPIRY_DAYS = 7;
/** After a deload week ends, no new deload is offered for two weeks (the stall window resets). */
export const DELOAD_BLOCK_DAYS = 14;

/** Epoch ms before which a pending suggestion has expired. */
export function expiryCutoff(now: Date): number {
  return now.getTime() - PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}
