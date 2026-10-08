// Rule-based suggestions engine (PLAN §11). `buildSuggestions(data, today)` returns the NEW
// suggestions to show, never more than `MAX_NEW_PER_WEEK` per ISO week, in the priority order of
// `SUGGESTION_KINDS`. It suggests, it never imposes: nothing changes until the person accepts.
import { differenceInCalendarDays, format, parseISO, startOfISOWeek } from 'date-fns';

import { ACCEPT_COOLDOWN_DAYS, MAX_NEW_PER_WEEK, REJECT_BLOCK_DAYS } from './limits';
import { RULES } from './rules';
import type { Suggestion, SuggestionData, SuggestionHistoryEntry, SuggestionKind } from './types';

const isoWeekOf = (day: string) => format(startOfISOWeek(parseISO(day)), 'yyyy-MM-dd');

/** How many suggestions were already created in the ISO week of `today`. */
export function createdThisWeek(history: readonly SuggestionHistoryEntry[], today: string): number {
  const week = isoWeekOf(today);
  return history.filter((entry) => isoWeekOf(entry.createdOn) === week).length;
}

/**
 * A kind is offered again only when: it is not already pending, it was not rejected in the last
 * four weeks and it was not accepted in the last week (so the change can show its effect).
 */
export function isKindAvailable(
  kind: SuggestionKind,
  history: readonly SuggestionHistoryEntry[],
  today: string,
): boolean {
  return history
    .filter((entry) => entry.kind === kind)
    .every((entry) => {
      if (entry.status === 'pending') return false;
      if (entry.decidedOn === null) return true;
      const since = differenceInCalendarDays(parseISO(today), parseISO(entry.decidedOn));
      if (entry.status === 'rejected') return since >= REJECT_BLOCK_DAYS;
      return since >= ACCEPT_COOLDOWN_DAYS;
    });
}

export function buildSuggestions(data: SuggestionData, today: string): Suggestion[] {
  const budget = MAX_NEW_PER_WEEK - createdThisWeek(data.history, today);
  if (budget <= 0) return [];

  const found: Suggestion[] = [];
  for (const rule of RULES) {
    if (found.length >= budget) break;
    const suggestion = rule(data, today);
    if (suggestion && isKindAvailable(suggestion.kind, data.history, today)) {
      found.push(suggestion);
    }
  }
  return found;
}
