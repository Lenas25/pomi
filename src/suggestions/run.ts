// Runs the engine once per day and stores what it finds; accepts or rejects a stored suggestion.
// Pure over `Db` + `Repositories` (no Expo imports), so it is tested on the in-memory database.
import { buildSuggestions } from '../domain/suggestions/buildSuggestions';
import { applyChange, type PlanPatch } from '../domain/suggestions/applyChange';
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
 */
export async function runDailySuggestions(
  db: Db,
  repos: Repositories,
  now: Date = new Date(),
): Promise<number[]> {
  await waitForMaintenance();
  const today = dayKeyFor(now);
  if ((await repos.settings.get('onboardingComplete')) !== true) return [];
  if ((await repos.settings.get('suggestionsLastRun')) === today) return [];

  const suggestions = buildSuggestions(await loadSuggestionData(repos, today), today);
  return withTransaction(db, async () => {
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
    // Marked only after the suggestions are stored: a failure runs the engine again later.
    await repos.settings.set('suggestionsLastRun', today);
    return ids;
  });
}

export type AcceptResult = { status: 'applied'; patch: PlanPatch } | { status: 'unavailable' };

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
    if (!row || !payload) return { status: 'unavailable' } as const;

    const today = dayKeyFor(now);
    const [anchors, shifts, gymDays, goals] = await Promise.all([
      repos.settings.get('anchors'),
      repos.settings.get('planShifts'),
      repos.settings.get('gymDays'),
      repos.settings.get('goals'),
    ]);
    const patch = applyChange(payload.change, {
      today,
      anchors: anchors ?? {},
      shifts: shifts ?? {},
      gymDays: gymDays ?? [],
      goals: goals ?? {},
    });
    if (patch.anchors) await repos.settings.set('anchors', patch.anchors);
    if (patch.shifts) await repos.settings.set('planShifts', patch.shifts);
    if (patch.gymDays) await repos.settings.set('gymDays', patch.gymDays);
    if (patch.goals) await repos.settings.set('goals', patch.goals);
    if (patch.deloadWeek) await repos.settings.set('deloadWeek', patch.deloadWeek);
    await repos.suggestions.decide(id, 'accepted', now.getTime());
    return { status: 'applied', patch } as const;
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
