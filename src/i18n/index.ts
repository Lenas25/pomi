import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { en } from './en';
import { es } from './es';
import type { Language, LanguagePreference, TranslationKey } from './types';

export type { Language, LanguagePreference, TranslationKey } from './types';

export const DEFAULT_LANGUAGE: Language = 'es';

const i18n = new I18n({ es, en });
i18n.defaultLocale = DEFAULT_LANGUAGE;
i18n.enableFallback = true;

/** Picks `en` only when the device's first language is English; everything else falls back to Spanish. */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguageCode: string | null | undefined,
): Language {
  if (preference === 'es' || preference === 'en') return preference;
  return deviceLanguageCode === 'en' ? 'en' : DEFAULT_LANGUAGE;
}

export function setLanguage(preference: LanguagePreference = 'system'): Language {
  const language = resolveLanguage(preference, getLocales()[0]?.languageCode);
  i18n.locale = language;
  return language;
}

setLanguage();

export function t(key: TranslationKey, options?: Record<string, string | number>): string {
  return i18n.t(key, options);
}
