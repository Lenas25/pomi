import { create } from 'zustand';

import { applyDraftPatch, emptyDraft, type OnboardingDraft } from '../domain/onboarding/draft';

type DraftState = {
  draft: OnboardingDraft;
  /** Merges answers into the draft. Pass `undefined` to clear an answer (skip). */
  update: (patch: Partial<OnboardingDraft>) => void;
  reset: () => void;
};

/** Onboarding answers in progress. In memory only: nothing is stored until the end. */
export const useOnboardingDraft = create<DraftState>((set) => ({
  draft: emptyDraft(),
  update: (patch) => set((state) => ({ draft: applyDraftPatch(state.draft, patch) })),
  reset: () => set({ draft: emptyDraft() }),
}));
