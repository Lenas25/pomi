// PLAN §9.1. Water goal: 33 ml per kg, +500 ml per gym hour, rounded UP to whole glasses.

export const WATER_ML_PER_KG = 33;
export const WATER_ML_PER_GYM_HOUR = 500;
export const DEFAULT_GLASS_ML = 250;

export type WaterGoalInput = {
  weightKg: number;
  /** Hours of exercise today (default 0 = rest day). One hour per gym session by default. */
  gymHours?: number;
  glassMl?: number;
};

export type WaterGoal = {
  /** Unrounded need: `33 × kg + 500 × gymHours`. */
  rawMl: number;
  glasses: number;
  /** `glasses × glassMl`, the goal actually shown. */
  ml: number;
  glassMl: number;
};

export function waterGoal({
  weightKg,
  gymHours = 0,
  glassMl = DEFAULT_GLASS_ML,
}: WaterGoalInput): WaterGoal {
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new RangeError('weightKg must be > 0');
  if (!Number.isFinite(gymHours) || gymHours < 0) throw new RangeError('gymHours must be >= 0');
  if (!Number.isFinite(glassMl) || glassMl <= 0) throw new RangeError('glassMl must be > 0');

  const rawMl = WATER_ML_PER_KG * weightKg + WATER_ML_PER_GYM_HOUR * gymHours;
  // Round to 6 decimals first so float noise (e.g. 2000.0000000000002) cannot add a glass.
  const glasses = Math.ceil(Number((rawMl / glassMl).toFixed(6)));
  return { rawMl, glasses, ml: glasses * glassMl, glassMl };
}
