// Turns a stored insight into the strings a card shows. The engine only produces keys and numbers
// (`src/domain/insights`); everything a person reads is composed here from i18n.
import type { Language, Translate } from '../i18n';

import type { StoredInsight } from './payload';

export type InsightTexts = { text: string; evidence: string };

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function insightTexts(
  insight: StoredInsight,
  t: Translate,
  language: Language,
): InsightTexts {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(insight.params)) {
    if (typeof value !== 'number') params[name] = value;
    else if (name === 'points' && !Number.isInteger(value)) {
      params[name] = value.toLocaleString(language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    } else params[name] = value.toLocaleString(language);
  }
  const weekday =
    typeof insight.params.weekday === 'number' ? WEEKDAY_KEYS[insight.params.weekday] : undefined;
  if (weekday) params.day = t(`suggestions.weekday.plural.${weekday}`);
  return {
    text: t(insight.textKey, params),
    evidence: t('insights.basedOn', { days: insight.days }),
  };
}
