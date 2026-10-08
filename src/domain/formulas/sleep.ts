// PLAN §9.3 plus the sleep-cycle calculator (PLAN §14b). All clocks are `HH:mm`; every function
// handles sleep that crosses midnight.
import {
  MINUTES_PER_DAY,
  clockToMinutes,
  forwardMinutes,
  minutesToClock,
  wrapMinutes,
} from '../time';

export const SLEEP_CYCLE_MIN = 90;
export const FALL_ASLEEP_MIN = 15;
export const DEFAULT_CYCLE_COUNTS = [4, 5, 6] as const;

/** Suggested bedtime = wake − target hours. */
export function bedtimeFor(wake: string, sleepTargetH: number): string {
  if (!Number.isFinite(sleepTargetH) || sleepTargetH <= 0 || sleepTargetH > 24) {
    throw new RangeError('sleepTargetH must be in (0, 24]');
  }
  return minutesToClock(clockToMinutes(wake) - sleepTargetH * 60);
}

/** Minutes slept between `bed` and `wake`, crossing midnight (23:00 -> 06:30 = 450). */
export function sleepDurationMin(bed: string, wake: string): number {
  return forwardMinutes(bed, wake);
}

export type MorningCheckin = {
  /** Day key `yyyy-MM-dd` of the morning. */
  date: string;
  bed: string;
  wake: string;
};

export type SleepSummary = {
  /** Check-ins used (the last 7 by date). */
  days: number;
  avgDurationMin: number;
  /**
   * Wake-time regularity = range (latest − earliest wake time) in minutes, computed on the circle
   * so 23:50 and 00:10 are 20 minutes apart. Range (not standard deviation) because the PLAN's
   * rule is phrased as "varies more than 60 min in the week". `null` with fewer than 2 days.
   */
  wakeRegularityMin: number | null;
};

/** Smallest span of an arc on the 24 h circle that contains every point. */
export function circularRange(minutes: readonly number[]): number {
  const sorted = [...minutes].sort((a, b) => a - b);
  // The widest empty gap between neighbours is the part NOT covered; the rest is the range.
  let widestGap = 0;
  sorted.forEach((value, index) => {
    const next = sorted[(index + 1) % sorted.length];
    if (next === undefined) return;
    const gap = index === sorted.length - 1 ? next + MINUTES_PER_DAY - value : next - value;
    widestGap = Math.max(widestGap, gap);
  });
  return MINUTES_PER_DAY - widestGap;
}

/** Average duration and wake regularity over the last 7 morning check-ins. */
export function summarizeSleep(checkins: readonly MorningCheckin[]): SleepSummary | null {
  const recent = [...checkins].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  if (recent.length === 0) return null;

  const total = recent.reduce((sum, item) => sum + sleepDurationMin(item.bed, item.wake), 0);
  const wakes = recent.map((item) => clockToMinutes(item.wake));
  return {
    days: recent.length,
    avgDurationMin: Math.round(total / recent.length),
    wakeRegularityMin: recent.length < 2 ? null : circularRange(wakes),
  };
}

export type SleepCycleOption = {
  cycles: number;
  /** Total sleep time, `cycles × 90`. */
  sleepMin: number;
  bedtime: string;
};

/**
 * Sleep-cycle calculator: bedtime = wake − n × 90 min − 15 min to fall asleep, for n = 4..6 by
 * default. Options are ordered by `cycles` ascending (latest bedtime first).
 */
export function sleepCycleBedtimes(
  wake: string,
  options: { cycleCounts?: readonly number[]; fallAsleepMin?: number } = {},
): SleepCycleOption[] {
  const { cycleCounts = DEFAULT_CYCLE_COUNTS, fallAsleepMin = FALL_ASLEEP_MIN } = options;
  const wakeMin = clockToMinutes(wake);
  return [...cycleCounts]
    .sort((a, b) => a - b)
    .map((cycles) => ({
      cycles,
      sleepMin: cycles * SLEEP_CYCLE_MIN,
      bedtime: minutesToClock(wrapMinutes(wakeMin - cycles * SLEEP_CYCLE_MIN - fallAsleepMin)),
    }));
}
