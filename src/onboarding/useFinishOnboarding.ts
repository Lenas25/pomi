import { useCallback, useRef, useState } from 'react';

import { requestNotificationSync } from '../notifications/sync';
import { getDatabase, getRepositories } from '../db';
import { completeOnboarding } from './complete';
import { useOnboardingDraft } from './draftStore';
import { useOnboardingStatusStore } from './statusStore';

/**
 * Saves the draft and flips the onboarding status. The root stack then hides the onboarding
 * routes and the entry route sends the person to Hoy.
 */
export function useFinishOnboarding() {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const inFlight = useRef(false);

  const finish = useCallback(async () => {
    // A second tap while saving must not write twice.
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await completeOnboarding(
        getDatabase(),
        getRepositories(),
        useOnboardingDraft.getState().draft,
      );
      // Flip the status first: the guard then swaps the stack away from the onboarding screens
      // before the draft is cleared, so no screen renders against an emptied draft.
      useOnboardingStatusStore.getState().setComplete(true);
      useOnboardingDraft.getState().reset();
      void requestNotificationSync('onboardingComplete');
    } catch (error) {
      if (__DEV__) console.error('Could not complete onboarding', error);
      setFailed(true);
      setSaving(false);
      inFlight.current = false;
    }
  }, []);

  return { finish, saving, failed };
}
