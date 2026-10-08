/** Where the day's steps come from. Rows in `steps_daily` use the same ids. */
export type StepsSourceId = 'health_connect' | 'manual';

export type HealthAvailability = 'available' | 'unavailable' | 'update_required';

export type DailySteps = {
  /** Local day `yyyy-MM-dd`. */
  date: string;
  steps: number;
};

/**
 * What the Habits tab needs from a step source. Kept small and promise-based so it can be faked in
 * tests; the Health Connect implementation lives in `healthConnect.ts` and is only loaded on Android.
 */
export interface HealthAdapter {
  readonly id: StepsSourceId;
  getAvailability(): Promise<HealthAvailability>;
  /** Whether the read-steps permission is currently granted (false until the person grants it). */
  hasPermission(): Promise<boolean>;
  /** Shows the system permission dialog. Resolves to whether the permission ended up granted. */
  requestPermission(): Promise<boolean>;
  /** Steps per local day for `from..to` (inclusive), one entry per day, zero-filled. */
  readDailySteps(from: string, to: string): Promise<DailySteps[]>;
  /** Opens the Health Connect app (to re-grant a denied permission). */
  openSettings(): void;
}
