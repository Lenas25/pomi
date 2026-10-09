// Ajustes > Apariencia: the i18n label of every theme and language choice.
import type { LanguagePreference, TranslationKey } from '../i18n';
import type { ThemeMode } from '../ui/theme';

export const THEME_LABELS: Record<ThemeMode, TranslationKey> = {
  system: 'settings.appearance.themeSystem',
  light: 'settings.appearance.themeLight',
  dark: 'settings.appearance.themeDark',
};

export const LANGUAGE_LABELS: Record<LanguagePreference, TranslationKey> = {
  system: 'settings.appearance.languageSystem',
  es: 'settings.appearance.languageEs',
  en: 'settings.appearance.languageEn',
};

export const THEME_OPTIONS: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const LANGUAGE_OPTIONS: readonly LanguagePreference[] = ['system', 'es', 'en'];
