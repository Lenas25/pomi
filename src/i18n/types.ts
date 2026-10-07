import type { es } from './es';

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

/** Shape every locale must satisfy. Spanish is the source of truth for keys. */
export type Messages = Widen<typeof es>;

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = Paths<Messages>;
export type Language = 'es' | 'en';
export type LanguagePreference = 'system' | Language;
