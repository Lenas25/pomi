// Template text (habit names, step names, check-in labels...) in the active language. Templates
// carry either a plain string or `{ es, en? }` (see `src/templates/localized.ts`).
import { useCallback } from 'react';

import { localizedText, mergeLocales, type LocalizedText } from '../templates/localized';

import { translateIn, useLocaleStore, type Language, type TranslationKey } from './index';

export type TemplateText = {
  (value: LocalizedText): string;
  (value: LocalizedText | undefined): string | undefined;
};

/** Non-reactive: the active language right now. Components should prefer `useTemplateText()`. */
export const templateText: TemplateText = ((value: LocalizedText | undefined) =>
  localizedText(value, useLocaleStore.getState().language)) as TemplateText;

/** Bound to the active language; the component re-renders when it changes. */
export function useTemplateText(): TemplateText {
  const language = useLocaleStore((state) => state.language);
  return useCallback(
    (value: LocalizedText | undefined) => localizedText(value, language),
    [language],
  ) as TemplateText;
}

/** The active language (non-reactive), for loaders and pure planners that take it as input. */
export function currentLanguage(): string {
  return useLocaleStore.getState().language;
}

/** An i18n resolver bound to one language (the generator and the editor library take one). */
export function resolverFor(
  language: Language,
): (key: string, params?: Record<string, string | number>) => string {
  return (key, params) => translateIn(language, key as TranslationKey, params);
}

/**
 * Renders a program-shaped value (built from i18n keys) in Spanish AND English and merges the two,
 * so its texts are `{ es, en }` and follow the language like the bundled templates do.
 */
export function renderBilingual<T>(
  render: (t: (key: string, params?: Record<string, string | number>) => string) => T,
): T {
  return mergeLocales(render(resolverFor('es')), render(resolverFor('en')));
}
