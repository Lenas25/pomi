// Deterministic synthetic history (60 days by default) to exercise the suggestion and insight
// engines, charts and reports in tests. Not used by the app at runtime.
import { addDays, format, getDay } from 'date-fns';

import { minutesToClock, wrapMinutes } from '../time';

export type SyntheticDay = {
  /** Day key `yyyy-MM-dd`. */
  date: string;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Planned a gym session (Mon–Thu pattern) and actually went. */
  gym: boolean;
  morning: { bed: string; wake: string; sleepMin: number; quality: number };
  night: { energy: number; mood: number };
  steps: number;
  waterMl: number;
  /** Millilitres per hour of the day (index 0..23); sums to `waterMl`. */
  waterByHour: number[];
  activity: 'gym' | 'walk' | 'none';
};

export type SyntheticOptions = {
  /** Number of days, ending on `endDate`. Default 60. */
  days?: number;
  /** Last day of the series. Default 2026-01-31. */
  endDate?: Date;
  /** PRNG seed: same seed, same data. Default 1. */
  seed?: number;
  /** Extra sleep on gym nights, an embedded effect insights can find. Default 35. */
  gymSleepBonusMin?: number;
  /** Wake-time target in minutes of the day. Default 05:10. */
  wakeMin?: number;
  /** Probability of attending a planned gym day. Default 0.85. */
  gymAttendance?: number;
  /** No water at all between 14:00 and 16:59 (a clear afternoon gap for the water curve). Default false. */
  afternoonGap?: boolean;
};

/** Small seeded PRNG (mulberry32): returns floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const WATER_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export function generateSyntheticDays(options: SyntheticOptions = {}): SyntheticDay[] {
  const {
    days = 60,
    endDate = new Date(2026, 0, 31),
    seed = 1,
    gymSleepBonusMin = 35,
    wakeMin = 5 * 60 + 10,
    gymAttendance = 0.85,
    afternoonGap = false,
  } = options;
  const rng = createRng(seed);
  const jitter = (spread: number) => (rng() * 2 - 1) * spread;

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(endDate, index - (days - 1));
    const weekday = getDay(date);
    const weekend = weekday === 0 || weekday === 6;
    const gym = weekday >= 1 && weekday <= 4 && rng() < gymAttendance;

    // Weekends drift later (social jetlag); gym days sleep a bit longer.
    const wake = wrapMinutes(wakeMin + (weekend ? 75 : 0) + jitter(15));
    const sleepMin = Math.round(
      clamp(420 + (gym ? gymSleepBonusMin : 0) + (weekend ? 20 : 0) + jitter(30), 240, 600),
    );
    const bed = wrapMinutes(wake - sleepMin);

    const quality = Math.round(clamp(3 + (sleepMin - 420) / 60 + jitter(0.8), 1, 5));
    const energy = Math.round(
      clamp(2.5 + (sleepMin - 420) / 60 + (gym ? 0.5 : 0) + jitter(0.8), 1, 5),
    );
    const mood = Math.round(clamp(3 + jitter(1.2), 1, 5));

    const steps = Math.round(
      clamp(6500 + (gym ? 1500 : 0) + (weekend ? -500 : 0) + jitter(2000), 800, 20000),
    );

    // Afternoon dip: fewer glasses between 14 and 17, so a water-curve engine has something to find.
    const waterByHour = Array.from({ length: 24 }, () => 0);
    for (const hour of WATER_HOURS) {
      const dip = hour >= 14 && hour <= 17 ? 0.35 : 1;
      const drawn = rng() < 0.75 * dip ? 1 : 0;
      // The draw above always happens, so the same seed gives the same days with or without the gap.
      const glasses = afternoonGap && hour >= 14 && hour <= 16 ? 0 : drawn;
      waterByHour[hour] = glasses * 250;
    }
    const waterMl = waterByHour.reduce((sum, ml) => sum + ml, 0);

    const activity: SyntheticDay['activity'] = gym ? 'gym' : steps > 8000 ? 'walk' : 'none';

    return {
      date: format(date, 'yyyy-MM-dd'),
      weekday,
      gym,
      morning: { bed: minutesToClock(bed), wake: minutesToClock(wake), sleepMin, quality },
      night: { energy, mood },
      steps,
      waterMl,
      waterByHour,
      activity,
    };
  });
}
