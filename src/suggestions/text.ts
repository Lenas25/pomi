// Turns a stored suggestion into the strings the card shows. The engine only produces keys and
// numbers (`src/domain/suggestions`); everything a person reads is composed here from i18n.
import type { Language, Translate, TranslationKey } from '../i18n';

import type { SuggestionPayload } from './payload';

export type SuggestionTexts = { text: string; reason: string; evidence: string };

/** Weekday number (0 = Sunday) -> i18n key part. */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const weekdayKey = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) ? WEEKDAY_KEYS[value] : undefined;

/** Params ready for interpolation: big numbers get the locale's thousands separator, weekdays get names. */
export function localizeParams(
  params: SuggestionPayload['params'],
  t: Translate,
  language: Language,
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    result[name] =
      typeof value === 'number' && value >= 1000 ? value.toLocaleString(language) : value;
  }
  const from = weekdayKey(params.fromDay);
  if (from) {
    result.fromDayName = t(`suggestions.weekday.name.${from}`);
    result.fromDayPlural = t(`suggestions.weekday.plural.${from}`);
  }
  const to = weekdayKey(params.toDay);
  if (to) {
    result.toDayName = t(`suggestions.weekday.name.${to}`);
    result.toDayPlural = t(`suggestions.weekday.plural.${to}`);
  }
  return result;
}

export function suggestionTexts(
  payload: SuggestionPayload,
  t: Translate,
  language: Language,
): SuggestionTexts {
  const params = localizeParams(payload.params, t, language);
  const key = (part: 'text' | 'reason'): TranslationKey => `suggestions.${payload.variant}.${part}`;
  return {
    text: t(key('text'), params),
    reason: t(key('reason'), params),
    evidence:
      payload.evidence.unit === 'sessions'
        ? t('suggestions.card.basedOnSessions', { count: payload.evidence.days })
        : t('suggestions.card.basedOn', { days: payload.evidence.days }),
  };
}
