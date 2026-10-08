import { useCallback } from 'react';
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import { create } from 'zustand';

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

type Persist = (preference: LanguagePreference) => Promise<void>;

let persist: Persist | null = null;

/** Wired at startup to the settings repository, keeping this module free of database imports. */
export function setLanguagePersistence(next: Persist | null): void {
  persist = next;
}

type LocaleState = {
  preference: LanguagePreference;
  /** The language actually in use (`system` already resolved). */
  language: Language;
  /** Changes the language and persists the preference (when persistence has been configured). */
  setPreference: (preference: LanguagePreference) => void;
  /** Applies a stored preference without persisting it; used at startup. */
  hydrate: (preference: LanguagePreference) => void;
};

function applyPreference(preference: LanguagePreference): Language {
  const language = resolveLanguage(preference, getLocales()[0]?.languageCode);
  i18n.locale = language;
  return language;
}

/** Holds the active language so components using `useT()` re-render when it changes. */
export const useLocaleStore = create<LocaleState>((set) => ({
  preference: 'system',
  language: applyPreference('system'),
  setPreference: (preference) => {
    set({ preference, language: applyPreference(preference) });
    // Best effort: the UI already changed, so a failed write must not break the app.
    persist?.(preference).catch(() => undefined);
  },
  hydrate: (preference) => set({ preference, language: applyPreference(preference) }),
}));

export function setLanguage(preference: LanguagePreference = 'system'): Language {
  useLocaleStore.getState().setPreference(preference);
  return useLocaleStore.getState().language;
}

export type Translate = (key: TranslationKey, options?: Record<string, string | number>) => string;

/** Non-reactive translation using the current language. In components, prefer `useT()`. */
export function t(key: TranslationKey, options?: Record<string, string | number>): string {
  return i18n.t(key, options);
}

/** Translation function bound to the active language; the component re-renders on language change. */
export function useT(): Translate {
  const language = useLocaleStore((state) => state.language);
  return useCallback((key, options) => i18n.t(key, { ...options, locale: language }), [language]);
}
