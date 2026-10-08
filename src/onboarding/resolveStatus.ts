import type { Repositories } from '../db/repositories';

/**
 * Whether the first-run onboarding counts as done. The `onboardingComplete` flag is the source of
 * truth, but data that predates it (a profile row or saved anchors) also means the person already
 * set the app up: they must not be sent through the questions again. In that case the flag is
 * written so the next launch takes the fast path.
 */
export async function resolveOnboardingComplete(
  repositories: Pick<Repositories, 'settings' | 'profile'>,
): Promise<boolean> {
  if ((await repositories.settings.get('onboardingComplete')) === true) return true;
  const hasData =
    (await repositories.profile.get()) !== undefined ||
    (await repositories.settings.get('anchors')) !== undefined;
  if (hasData) await repositories.settings.set('onboardingComplete', true);
  return hasData;
}
