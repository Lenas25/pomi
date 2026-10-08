// Route gating for the first run. Pure so it can be tested without a navigator.

export type OnboardingStatus = 'unknown' | 'incomplete' | 'complete';

export type RouteGuards = {
  /** Show the onboarding routes. */
  onboarding: boolean;
  /** Show the app routes (tabs, gym session, check-ins, share). */
  app: boolean;
};

/** Which route groups the root stack may expose. `unknown` (still loading) exposes neither. */
export function routeGuards(status: OnboardingStatus): RouteGuards {
  return { onboarding: status === 'incomplete', app: status === 'complete' };
}

/** Where the entry route (`/`) sends the person. `null` while the status is not known yet. */
export function entryHref(status: OnboardingStatus): '/onboarding' | '/(tabs)/hoy' | null {
  if (status === 'unknown') return null;
  return status === 'complete' ? '/(tabs)/hoy' : '/onboarding';
}
