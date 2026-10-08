import { useStore } from 'zustand';

import { getTimerStore } from './store';
import type { ActiveTimer } from './timerStore';

export { getTimerStore } from './store';
export { useNow } from './useNow';
export { useTimerFeedback } from './useTimerFeedback';

/** The active timer (or `null`); re-renders on every state transition, not on clock ticks. */
export function useActiveTimer(): ActiveTimer | null {
  return useStore(getTimerStore(), (state) => state.active);
}
