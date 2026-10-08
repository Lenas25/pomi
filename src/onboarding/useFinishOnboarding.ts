import { useCallback, useState } from 'react';

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

  const finish = useCallback(async () => {
    setSaving(true);
    setFailed(false);
    try {
      await completeOnboarding(
        getDatabase(),
        getRepositories(),
        useOnboardingDraft.getState().draft,
      );
      useOnboardingDraft.getState().reset();
      useOnboardingStatusStore.getState().setComplete(true);
    } catch (error) {
      if (__DEV__) console.error('Could not complete onboarding', error);
      setFailed(true);
      setSaving(false);
    }
  }, []);

  return { finish, saving, failed };
}
