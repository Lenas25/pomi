// Pure core of the scheduler (no Expo imports, so it is unit tested with fakes).
import { buildUpcoming, WINDOW_DAYS } from '../domain/notifications/buildUpcoming';
import { dayKeyFor } from '../domain/time';
import { signatureOf } from '../domain/notifications/diff';
import type { Translate } from '../i18n';

import type { NotificationPlan } from './loadState';
import { reconcile, type ReconcileResult, type SchedulerApi } from './reconcile';
import { resolvePlanned, type ResolvedPlanned } from './resolve';

export type SyncDeps = {
  now: () => Date;
  loadPlan: (today: string) => Promise<NotificationPlan>;
  /** Whether the OS lets us show notifications (never prompts here). */
  canNotify: () => Promise<boolean>;
  /** Channels and categories, created before scheduling. */
  prepare: (t: Translate) => Promise<void>;
  api: SchedulerApi<ResolvedPlanned>;
  t: Translate;
};

export type SyncResult = ReconcileResult & { skipped: 'disabled' | 'no-permission' | null };

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now();
  const plan = await deps.loadPlan(dayKeyFor(now));
  const none: ReconcileResult = { scheduled: 0, cancelled: 0, failed: 0 };

  if (!plan.enabled) {
    // Switched off (or not onboarded): leave nothing of ours scheduled.
    const cancelled = await reconcile([], deps.api, signatureOf);
    return { ...cancelled, skipped: 'disabled' };
  }
  if (!(await deps.canNotify())) return { ...none, skipped: 'no-permission' };

  await deps.prepare(deps.t);
  const desired = buildUpcoming(plan.state, now, WINDOW_DAYS).map((planned) =>
    resolvePlanned(planned, deps.t),
  );
  return { ...(await reconcile(desired, deps.api, signatureOf)), skipped: null };
}
