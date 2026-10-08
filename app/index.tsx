import { Redirect } from 'expo-router';

import { entryHref } from '../src/domain/onboarding/redirect';
import { useOnboardingStatusStore } from '../src/onboarding/statusStore';

/** Entry route: first run goes to the onboarding, everyone else to Hoy. */
export default function Index() {
  const status = useOnboardingStatusStore((state) => state.status);
  const href = entryHref(status);
  return href === null ? null : <Redirect href={href} />;
}
