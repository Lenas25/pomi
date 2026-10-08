import { dayKeyFor } from '../domain/time';
import { mapDraftToPersistence } from '../domain/onboarding/mapDraft';
import type { OnboardingDraft } from '../domain/onboarding/draft';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';
import type { Repositories } from '../db/repositories';

/**
 * Persists the onboarding answers (profile, settings, anchors, gym days, goals) and marks the
 * onboarding complete, all in one transaction so a failure never leaves it half done.
 */
export async function completeOnboarding(
  db: Db,
  repositories: Repositories,
  draft: OnboardingDraft,
  today: string = dayKeyFor(new Date()),
): Promise<void> {
  const { profile, settings } = mapDraftToPersistence(draft);
  await withTransaction(db, async () => {
    if (Object.keys(profile).length > 0) await repositories.profile.save(profile);
    await repositories.settings.set('anchors', settings.anchors);
    await repositories.settings.set('gymDays', settings.gymDays);
    await repositories.settings.set('checkinPrefs', settings.checkinPrefs);
    await repositories.settings.set('goals', settings.goals);
    if (settings.userName !== undefined)
      await repositories.settings.set('userName', settings.userName);
    else await repositories.settings.remove('userName');
    if (settings.stepsEstimate !== undefined) {
      await repositories.settings.set('stepsEstimate', settings.stepsEstimate);
    } else await repositories.settings.remove('stepsEstimate');
    if (settings.freeDays !== undefined) {
      await repositories.settings.set('freeDays', settings.freeDays);
    } else await repositories.settings.remove('freeDays');
    await repositories.settings.set('startedOn', today);
    await repositories.settings.set('onboardingComplete', true);
  });
}
