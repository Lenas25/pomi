// Runs the engine once per day and stores what it finds; accepts or rejects a stored suggestion.
// Pure over `Db` + `Repositories` (no Expo imports), so it is tested on the in-memory database.
import { buildSuggestions } from '../domain/suggestions/buildSuggestions';
import { applyChange, isChangeStale, type PlanPatch } from '../domain/suggestions/applyChange';
import { expiryCutoff } from '../domain/suggestions/limits';
import { gymWeekStart, usualGymPlan } from '../domain/gym/gymPlan';
import { DEFAULT_GYM_TIMES } from '../domain/onboarding/draft';
import { activeDeloadPct } from '../gym/deload';
import { dayKeyFor } from '../domain/time';
import type { Repositories } from '../db/repositories';
import { waitForMaintenance } from '../db/maintenance';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';

import { loadSuggestionData } from './loadData';
import { parsePayload, toPayload } from './payload';

/**
 * Computes today's suggestions and stores them as `pending`. A no-op when it already ran today
 * (the day is the logical one, 04:00 rollover), before the onboarding finished, or when
 * nothing applies. Returns the ids it created.
 *
 * The whole run (check `suggestionsLastRun`, load, build, insert, mark) is ONE serialized
 * transaction, and `suggestionsLastRun` is read again INSIDE it: the foreground reload and the
 * background task can start together, and the second one must see the first one's mark instead of
 * building (and storing) the same suggestions twice. Pending ones older than a week are removed
 * first, so their kind can be offered again.
 */
export async function runDailySuggestions(
  db: Db,
  repos: Repositories,
  now: Date = new Date(),
): Promise<number[]> {
  await waitForMaintenance();
  const today = dayKeyFor(now);
  return withTransaction(db, async () => {
    if ((await repos.settings.get('onboardingComplete')) !== true) return [];
    if ((await repos.settings.get('suggestionsLastRun')) === today) return [];

    await repos.suggestions.expirePending(expiryCutoff(now));
    const suggestions = buildSuggestions(await loadSuggestionData(repos, today), today);
    const ids: number[] = [];
    for (const suggestion of suggestions) {
      ids.push(
        await repos.suggestions.create({
          kind: suggestion.kind,
          payload: toPayload(suggestion),
          reason: suggestion.reasonKey,
          createdAt: now.getTime(),
        }),
      );
    }
    // Marked in the same transaction as the inserts: a failure rolls both back.
    await repos.settings.set('suggestionsLastRun', today);
    return ids;
  });
}

export type AcceptResult =
  | {
      status: 'applied';
      patch: PlanPatch;
      /** A gym-day move changed the usual plan while this week has its own override (kept). */
      weekOverrideKept?: boolean;
    }
  | { status: 'unavailable' };

/**
 * "Aceptar": applies the change through the repositories and marks the suggestion accepted, all in
 * ONE transaction. `unavailable` when it is gone, already decided or its payload is unreadable. The
 * caller reschedules the notifications afterwards (reason `suggestionAccepted`).
 */
export async function acceptSuggestion(
  db: Db,
  repos: Repositories,
  id: number,
  now: Date = new Date(),
): Promise<AcceptResult> {
  return withTransaction(db, async () => {
    const row = await repos.suggestions.get(id);
    const payload = row?.status === 'pending' ? parsePayload(row.payload) : null;
    // Unreadable, already decided or expired (older than a week): nothing to apply.
    if (!row || !payload || row.createdAt < expiryCutoff(now))
      return { status: 'unavailable' } as const;

    const today = dayKeyFor(now);
    const [anchors, shifts, gymDays, goals, goalsChangedOn, deloadWeek, gymPlan] =
      await Promise.all([
        repos.settings.get('anchors'),
        repos.settings.get('planShifts'),
        repos.settings.get('gymDays'),
        repos.settings.get('goals'),
        repos.settings.get('goalsChangedOn'),
        repos.settings.get('deloadWeek'),
        repos.settings.get('gymPlan'),
      ]);
    const plan = {
      today,
      anchors: anchors ?? {},
      shifts: shifts ?? {},
      gymDays: gymDays ?? [],
      goals: goals ?? {},
    };
    // The plan may have moved since the suggestion was made (another accepted change, a manual
    // edit): re-validate against the CURRENT plan instead of applying a stale proposal.
    const stale = isChangeStale(payload.change, {
      ...plan,
      createdOn: dayKeyFor(new Date(row.createdAt)),
      goalsChangedOn,
      deloadActive: activeDeloadPct(deloadWeek, today) !== undefined,
    });
    if (stale) return { status: 'unavailable' } as const;
    const patch = applyChange(payload.change, plan);
    if (patch.anchors) await repos.settings.set('anchors', patch.anchors);
    if (patch.shifts) await repos.settings.set('planShifts', patch.shifts);
    if (patch.gymDays) {
      // Keep the per-day plan in step: the moved session keeps its time, a slot without one gets
      // its anchor, or the slot's default time when the anchor is missing (a weekday is never
      // dropped for lack of a time). A week override ("Planifica tu semana") is NOT touched.
      const slotTimes = {
        ...anchors,
        gymMorning: anchors?.gymMorning ?? DEFAULT_GYM_TIMES.gymMorning,
        gymEvening: anchors?.gymEvening ?? DEFAULT_GYM_TIMES.gymEvening,
      };
      const nextPlan = usualGymPlan({
        gymPlan,
        gymDays: patch.gymDays,
        anchors: slotTimes,
      }).flatMap((entry) =>
        entry.time === undefined ? [] : [{ weekday: entry.weekday, time: entry.time }],
      );
      // Without a stored plan nor any slot anchor there is nothing to keep in step.
      if (
        gymPlan !== undefined ||
        anchors?.gymMorning !== undefined ||
        anchors?.gymEvening !== undefined
      )
        await repos.settings.set('gymPlan', nextPlan);
      await repos.settings.set('gymDays', patch.gymDays);
    }
    if (patch.goals) await repos.settings.set('goals', patch.goals);
    if (patch.deloadWeek) await repos.settings.set('deloadWeek', patch.deloadWeek);
    await repos.suggestions.decide(id, 'accepted', now.getTime());
    const weekOverrideKept =
      patch.gymDays !== undefined &&
      (await repos.settings.get('gymWeekPlans'))?.[gymWeekStart(today)] !== undefined;
    return { status: 'applied', patch, ...(weekOverrideKept ? { weekOverrideKept } : {}) } as const;
  });
}

/** "Ahora no": rejected, so its kind is not offered again for four weeks. */
export async function rejectSuggestion(
  repos: Repositories,
  id: number,
  now: Date = new Date(),
): Promise<boolean> {
  return repos.suggestions.decide(id, 'rejected', now.getTime());
}
