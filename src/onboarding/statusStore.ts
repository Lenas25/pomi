import { create } from 'zustand';

import type { OnboardingStatus } from '../domain/onboarding/redirect';

type StatusState = {
  status: OnboardingStatus;
  setComplete: (complete: boolean) => void;
};

/** Whether the first-run onboarding is done. Hydrated by the database bootstrap. */
export const useOnboardingStatusStore = create<StatusState>((set) => ({
  status: 'unknown',
  setComplete: (complete) => set({ status: complete ? 'complete' : 'incomplete' }),
}));
