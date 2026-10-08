// Pure rules of the single periodic background job (no Expo imports, tested with fakes).
//
// One WorkManager job serves two things with different needs: the sedentary nudge wants a check
// about every 15 minutes, while the notification window refill and the suggestions run only need
// to happen every few hours. The job wakes at the nudge cadence while the nudge can work, and the
// heavy work is throttled by a persisted timestamp.
import { nudgeNeedsFrequentWorker, type StoredSedentaryConfig } from '../sedentary/runNudge';

/** Heavy work (suggestions run, notification sync) happens at most this often. */
export const HEAVY_INTERVAL_MS = 6 * 60 * 60_000;
/** The minimum WorkManager allows; used only while the nudge can actually run. */
export const FREQUENT_INTERVAL_MIN = 15;
/** Minutes between runs of the job when the nudge does not need it. */
export const RELAXED_INTERVAL_MIN = 6 * 60;

/** WorkManager wakes drift by minutes; without slack a 6 h interval would often skip a whole cycle. */
export const HEAVY_SLACK_MS = 20 * 60_000;

/** Whether the heavy work is due (never ran, a clock set back, or the interval minus slack elapsed). */
export function isHeavyDue(lastRunAt: number | undefined, nowMs: number): boolean {
  if (lastRunAt === undefined || lastRunAt > nowMs) return true;
  return nowMs - lastRunAt >= HEAVY_INTERVAL_MS - HEAVY_SLACK_MS;
}

/**
 * Interval the job needs: 15 minutes only when the nudge is on AND the background read permission
 * is granted (without it every 15-minute wake-up would be wasted), 6 hours otherwise.
 */
export function intervalFor(
  config: StoredSedentaryConfig | undefined,
  backgroundPermission: boolean,
): number {
  return nudgeNeedsFrequentWorker(config) && backgroundPermission
    ? FREQUENT_INTERVAL_MIN
    : RELAXED_INTERVAL_MIN;
}

/**
 * Registering again with `CANCEL_AND_REENQUEUE` resets the period, so the job is registered only
 * when it is not registered yet or when the cadence really flipped.
 */
export function shouldRegister(
  wanted: number,
  remembered: number | undefined,
  registered: boolean,
): boolean {
  return !registered || remembered !== wanted;
}

export type JobDeps = {
  now: () => Date;
  bootstrap: () => Promise<void>;
  lastHeavyRunAt: () => Promise<number | undefined>;
  saveHeavyRunAt: (ms: number) => Promise<void>;
  suggestions: () => Promise<unknown>;
  sync: () => Promise<unknown>;
  nudge: () => Promise<unknown>;
  /** After the nudge: detects revoked Health Connect permissions (turns the nudge off, relaxes the cadence). */
  permissionCheck?: () => Promise<unknown>;
  report?: (what: string, error: unknown) => void;
};

/**
 * One run of the job. A database that cannot open or a failing heavy sync fails the run (the sync
 * rewinds the heavy stamp); every step is isolated so a failing sync never keeps the nudge from
 * being attempted.
 */
export async function runBackgroundJob(deps: JobDeps): Promise<'success' | 'failed'> {
  const report = deps.report ?? (() => undefined);
  try {
    await deps.bootstrap();
  } catch {
    return 'failed';
  }
  const nowMs = deps.now().getTime();
  const last = await deps.lastHeavyRunAt().catch(() => undefined);
  let heavyFailed = false;
  if (isHeavyDue(last, nowMs)) {
    // Stamped first: a run that crashes midway is not retried every 15 minutes.
    await deps.saveHeavyRunAt(nowMs).catch((error: unknown) => report('stamp', error));
    await deps.suggestions().catch((error: unknown) => report('suggestions', error));
    // Same mutex as the foreground triggers; its own failure never skips the nudge.
    await deps.sync().catch((error: unknown) => {
      heavyFailed = true;
      report('sync', error);
    });
    // A failed sync rewinds the stamp so the next wake retries instead of waiting ~6 h.
    if (heavyFailed) {
      await deps.saveHeavyRunAt(last ?? 0).catch((error: unknown) => report('rewind', error));
    }
  }
  await deps.nudge().catch((error: unknown) => report('nudge', error));
  await deps.permissionCheck?.().catch((error: unknown) => report('permission', error));
  return heavyFailed ? 'failed' : 'success';
}
