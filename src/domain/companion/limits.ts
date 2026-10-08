// Thresholds of the companion engines (PLAN §14b). Documented defaults, not findings.

/** Sleep debt: rolling window, minimum nights with data, and the most a long night can give back. */
export const SLEEP_DEBT_WINDOW_DAYS = 7;
export const SLEEP_DEBT_MIN_DAYS = 4;
export const SLEEP_SURPLUS_CAP_MIN = 60;
/** The Hoy card only appears from this much missing sleep; Progreso always shows the number. */
export const SLEEP_DEBT_CARD_MIN = 120;

/** Social jetlag: window, minimum nights per group and the size from which it is mentioned. */
export const JETLAG_WINDOW_DAYS = 14;
export const JETLAG_MIN_WORK_NIGHTS = 3;
export const JETLAG_MIN_FREE_NIGHTS = 2;
export const JETLAG_MENTION_MIN = 60;
/** Saturday and Sunday (0 = Sunday). Editable by the caller. */
export const DEFAULT_FREE_WEEKDAYS: readonly number[] = [6, 0];

/** Water curve: window of finished days, minimum days with a record and the afternoon gap rule. */
export const WATER_CURVE_WINDOW_DAYS = 14;
export const WATER_CURVE_MIN_DAYS = 7;
export const WATER_GAP_HOURS = 3;
export const WATER_GAP_FROM_HOUR = 12;
export const WATER_GAP_TO_HOUR = 19;
/** Share of recorded days without a write in the window: 5 of 7. */
export const WATER_GAP_SHARE = 5 / 7;
/** Hours drawn on the chart. */
export const WATER_CHART_FROM_HOUR = 6;
export const WATER_CHART_TO_HOUR = 22;

/** "Tu ritmo": minimum days with check-ins and per compared group (PLAN §12). */
export const RHYTHM_MIN_DAYS = 21;
export const RHYTHM_MIN_GROUP = 7;
/** Days looked back for "Tu ritmo". */
export const RHYTHM_WINDOW_DAYS = 42;
/** Chronotype looks at ONE group (free days), not a comparison: two weekends are enough. */
export const RHYTHM_MIN_FREE_NIGHTS = 4;
/** Energy only counts as different from this many points on the 1-5 scale (PLAN §14b). */
export const ENERGY_DIFF_MIN = 0.5;
/** Sleep of at least this much is the "enough" group (PLAN §12: 7 hours or more). */
export const ENOUGH_SLEEP_MIN = 420;
/** Chronotype from the mid-sleep of free days [DESIGN]: before 03:30 / until 05:00 / later. */
export const MORNING_MIDSLEEP_BEFORE_MIN = 3 * 60 + 30;
export const EVENING_MIDSLEEP_AFTER_MIN = 5 * 60;
/** A weekday is among "the days you move most" with this share of observed days moving. */
export const ACTIVE_WEEKDAY_MIN_SHARE = 0.5;
export const ACTIVE_WEEKDAY_MIN_OBSERVED = 3;
