// Thresholds of the insights engine (PLAN §12). Documented defaults [DESIGN], not findings: they
// only decide when a difference between two groups of days is worth mentioning.

/** At most this many NEW insights per ISO week. */
export const MAX_NEW_PER_WEEK = 1;
/** Days looked back. */
export const INSIGHTS_WINDOW_DAYS = 90;
/** Days with check-ins needed before anything is compared (PLAN §12). */
export const MIN_CHECKIN_DAYS = 21;
/** Days needed in EACH group that is compared (PLAN §12). */
export const MIN_GROUP_DAYS = 7;

/** Sleep: minutes of difference between the means. */
export const SLEEP_DIFF_MIN = 20;
/** 1-5 scales (energy): points of difference. The same value "Tu ritmo" uses (`ENERGY_DIFF_MIN`). */
export const SCALE_DIFF_MIN = 0.5;
/** Steps: difference between the daily means. */
export const STEPS_DIFF_MIN = 1000;
/**
 * Gym performance: percentage points. Performance of a session = share (0-100) of its exercises
 * whose estimated 1RM (Epley, `strength.ts`) matched or beat the previous session of that exercise.
 */
export const GYM_PERFORMANCE_DIFF_MIN = 15;
/** Sleep quality groups (1-5 scale): good nights are >= 4, poor ones <= 2. */
export const QUALITY_GOOD_MIN = 4;
export const QUALITY_POOR_MAX = 2;
/** Consistency: share (0-1) of observed days with movement that a weekday must lead the rest by. */
export const WEEKDAY_SHARE_DIFF_MIN = 0.2;
/** Observed days a weekday needs (about 10 weeks of that weekday) before it can be named the most active. */
/** ...and by this much over the second-best weekday (a runner-up close behind is not a clear winner). */
export const WEEKDAY_LEAD_OVER_SECOND_MIN = 0.25;
export const WEEKDAY_MIN_OBSERVED = 10;

/** The same kind is not repeated within this many days unless its value changed meaningfully. */
export const REPEAT_BLOCK_DAYS = 28;
