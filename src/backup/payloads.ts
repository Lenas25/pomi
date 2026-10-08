// Per-kind checks of the JSON columns that a backup restores verbatim. A restored row must be
// something the app can read later, so each column is validated against what its writer stores
// (an unreadable `suggestions.payload` would otherwise hide a card forever).
import { z } from 'zod';

import { suggestionPayloadSchema } from '../suggestions/payload';
import { scheduleSchema } from '../templates/schema';

/** The only change type each suggestion kind may carry. */
const CHANGE_TYPE_BY_KIND: Readonly<Record<string, string>> = {
  deload: 'deload',
  sleepEarlier: 'bedtimeShift',
  wakeRegularity: 'wakeTime',
  gymDay: 'moveGymDay',
  stepsGoal: 'stepsGoal',
  waterEarlier: 'waterShift',
};

/** `suggestions.payload` for `suggestions.kind`: known kind, valid payload, matching change. */
export function isValidSuggestionPayload(kind: string, payload: unknown): boolean {
  const expected = CHANGE_TYPE_BY_KIND[kind];
  if (expected === undefined) return false;
  const parsed = suggestionPayloadSchema.safeParse(payload);
  return parsed.success && parsed.data.change.type === expected;
}

/**
 * `insights.evidence`: the insights engine (v3) does not exist yet, so only the shape is fixed: a
 * JSON object or list (the numbers behind a finding), never a bare scalar or null.
 */
const evidenceSchema = z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]);
export function isValidInsightEvidence(evidence: unknown): boolean {
  return evidenceSchema.safeParse(evidence).success;
}

/** `reminders.schedule` is a template `Schedule`. */
export function isValidReminderSchedule(schedule: unknown): boolean {
  return scheduleSchema.safeParse(schedule).success;
}

/** `checkins.answers`: question id -> text or number (what the check-in flow writes). */
export const checkinAnswersSchema = z.record(
  z.string().min(1).max(64),
  z.union([z.string().max(2000), z.number().finite()]),
);
