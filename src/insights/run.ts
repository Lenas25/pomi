// Runs the insights engine once per ISO week and stores what it finds. Pure over `Db` +
// `Repositories` (no Expo imports), so it is tested on the in-memory database.
import { buildInsights, hasEnoughCheckinDays, isoWeekStart } from '../domain/insights';
import { dayKeyFor } from '../domain/time';
import type { Repositories } from '../db/repositories';
import { waitForMaintenance } from '../db/maintenance';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';

import { loadInsightData } from './loadData';
import { toStoredEvidence } from './payload';

/**
 * Computes this week's insight and stores it (unseen). A no-op when it already ran this ISO week
 * (the day is the logical one, 04:00 rollover), before the onboarding finished, or when nothing
 * qualifies. While the 21-day check-in threshold is not met the week stays unmarked, so the first
 * run after crossing it (mid-week included) is not postponed to the next week. Returns the ids it created (at most one).
 *
 * Like `runDailySuggestions`, the whole run (check `insightsLastRun`, load, build, insert, mark) is
 * ONE serialized transaction and the marker is read again INSIDE it: the foreground reload and the
 * background task can start together, and the second must see the first one's mark.
 */
export async function runWeeklyInsights(
  db: Db,
  repos: Repositories,
  now: Date = new Date(),
): Promise<number[]> {
  await waitForMaintenance();
  const today = dayKeyFor(now);
  const week = isoWeekStart(today);
  return withTransaction(db, async () => {
    if ((await repos.settings.get('onboardingComplete')) !== true) return [];
    if ((await repos.settings.get('insightsLastRun')) === week) return [];

    const data = await loadInsightData(repos, today);
    // Below the 21-day threshold nothing is compared and the week is NOT marked: the run that
    // first crosses it, even mid-week, must still happen (the next weekly marker would be late).
    if (!hasEnoughCheckinDays(data, today)) return [];

    const ids: number[] = [];
    for (const insight of buildInsights(data, today)) {
      ids.push(
        await repos.insights.create({
          kind: insight.kind,
          text: insight.textKey,
          evidence: toStoredEvidence(insight),
          createdAt: now.getTime(),
        }),
      );
    }
    await repos.settings.set('insightsLastRun', week);
    return ids;
  });
}
