// Which (kind, target) pairs may be offered again. Shared by the rules (to pick another candidate
// when the best one was rejected) and by `buildSuggestions` (the final check).
import { differenceInCalendarDays, parseISO } from 'date-fns';

import { REJECT_BLOCK_DAYS } from './limits';
import type { SuggestionChange, SuggestionHistoryEntry, SuggestionKind } from './types';

/**
 * What a change is about, so a rejection blocks only that target: the weekday that was moved, the
 * exercise that stalled. `null` for kinds that have a single possible target.
 */
export function targetOfChange(change: SuggestionChange): string | null {
  switch (change.type) {
    case 'moveGymDay':
      return `day:${change.fromDay}`;
    case 'deload':
      return `step:${change.stepId}`;
    default:
      return null;
  }
}

/** Rejected within the block window for this exact (kind, target). */
export function isRejectBlocked(
  history: readonly SuggestionHistoryEntry[],
  kind: SuggestionKind,
  target: string | null,
  today: string,
): boolean {
  return history.some(
    (entry) =>
      entry.kind === kind &&
      (entry.target ?? null) === target &&
      entry.status === 'rejected' &&
      entry.decidedOn !== null &&
      differenceInCalendarDays(parseISO(today), parseISO(entry.decidedOn)) < REJECT_BLOCK_DAYS,
  );
}
