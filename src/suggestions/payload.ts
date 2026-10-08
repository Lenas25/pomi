// The JSON stored in `suggestions.payload`: everything needed to show and to apply a suggestion
// later, validated on read (the table is also restored from backups).
import { z } from 'zod';

import type { Suggestion, SuggestionChange } from '../domain/suggestions/types';

const changeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bedtimeShift'), fromMin: z.number(), toMin: z.number() }),
  z.strictObject({ type: z.literal('wakeTime'), to: z.string() }),
  z.strictObject({ type: z.literal('stepsGoal'), from: z.number(), to: z.number() }),
  z.strictObject({ type: z.literal('waterShift'), fromMin: z.number(), toMin: z.number() }),
  z.strictObject({ type: z.literal('moveGymDay'), fromDay: z.number(), toDay: z.number() }),
  z.strictObject({ type: z.literal('deload'), pct: z.number(), stepId: z.string() }),
]);

const valueSchema = z.union([z.string(), z.number()]);

export const suggestionPayloadSchema = z.strictObject({
  variant: z.enum([
    'deload',
    'sleepEarlier',
    'wakeRegularity',
    'gymDay',
    'stepsRaise',
    'stepsLower',
    'waterEarlier',
  ]),
  change: changeSchema,
  params: z.record(z.string(), valueSchema),
  // `unit` is absent in rows stored before it existed (they counted days).
  evidence: z
    .record(z.string(), valueSchema)
    .and(z.object({ days: z.number(), unit: z.enum(['days', 'sessions']).optional() })),
});

export type SuggestionPayload = z.infer<typeof suggestionPayloadSchema>;

// The stored change must stay the domain's change (compile-time check).
const _sameChange = (change: SuggestionPayload['change']): SuggestionChange => change;
void _sameChange;

export function toPayload(suggestion: Suggestion): SuggestionPayload {
  return {
    variant: suggestion.variant,
    change: suggestion.change,
    params: suggestion.params,
    evidence: suggestion.evidence,
  };
}

/** `null` for a row that does not match (never shown, never applied). */
export function parsePayload(payload: unknown): SuggestionPayload | null {
  const parsed = suggestionPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
