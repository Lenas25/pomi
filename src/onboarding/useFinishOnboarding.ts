import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';

import { requestNotificationSync } from '../notifications/sync';
import { getDatabase, getRepositories } from '../db';
import { completeOnboarding } from './complete';
import { useOnboardingDraft } from './draftStore';
import { useOnboardingStatusStore } from './statusStore';

/** Where the person lands once the onboarding is done. */
export const HOME_HREF = '/(tabs)/hoy';

/** Runs a post-completion side effect without ever letting it break the hand-off to the app. */
function nonFatal(what: string, effect: () => unknown): void {
  try {
    const result = effect();
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        if (__DEV__) console.warn(`Onboarding: ${what} failed`, error);
      });
    }
  } catch (error) {
    if (__DEV__) console.warn(`Onboarding: ${what} failed`, error);
  }
}

/**
 * Saves the draft and flips the onboarding status. The root stack then hides the onboarding
 * routes and lands on Hoy; if this screen is somehow still mounted after the flip has been
 * committed, it navigates to Hoy explicitly so the stack is never left without a screen.
 */
export function useFinishOnboarding() {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
    } catch (error) {
      if (__DEV__) console.error('Could not complete onboarding', error);
      setFailed(true);
      setSaving(false);
      inFlight.current = false;
      return;
    }
    // The answers are saved: nothing below may surface as a failure or crash the app.
    // Flip the status first: the guard then swaps the stack away from the onboarding screens
    // before the draft is cleared, so no screen renders against an emptied draft.
    nonFatal('status flip', () => useOnboardingStatusStore.getState().setComplete(true));
    nonFatal('draft reset', () => useOnboardingDraft.getState().reset());
    nonFatal('notification sync', () => requestNotificationSync('onboardingComplete'));
    // Runs after React has committed the guard flip (a macrotask after the store update).
    setTimeout(() => {
      if (!mounted.current) return;
      nonFatal('navigation to Hoy', () => router.replace(HOME_HREF));
    }, 0);
  }, []);

  return { finish, saving, failed };
}
