import { z } from 'zod';

/**
 * Localized template text (v3 "Inglés completo").
 *
 * Every user-facing text field of a template accepts either a plain string (legacy and community
 * templates: shown as written, in whatever language the author used) or a map with the Spanish text
 * (required, the project's source language) and an optional English translation.
 */

export const TEXT_LOCALES = ['es', 'en'] as const;
export type TextLocale = (typeof TEXT_LOCALES)[number];

export type LocalizedMap = { es: string; en?: string | undefined };
export type LocalizedText = string | LocalizedMap;

/** A localized text field; `minLength` 1 for required names/labels, 0 for free text such as `how`. */
export function localizedTextSchema(minLength: 0 | 1 = 1) {
  const text = minLength === 1 ? z.string().min(1) : z.string();
  return z.union([text, z.strictObject({ es: text, en: text.optional() })]);
}

/** Resolves a localized text: requested locale, then Spanish, then the first available text. */
export function localizedText(value: LocalizedText, locale: string): string;
export function localizedText(value: LocalizedText | undefined, locale: string): string | undefined;
export function localizedText(value: LocalizedText | undefined, locale: string): string | undefined {
  if (value === undefined || typeof value === 'string') return value;
  if (locale === 'en' && value.en !== undefined && value.en !== '') return value.en;
  if (value.es !== '') return value.es;
  return value.en ?? value.es;
}

/** The Spanish (source) text, used as a stable label for comparisons and slugs. */
export function sourceText(value: LocalizedText): string {
  return typeof value === 'string' ? value : value.es;
}

/**
 * Replaces the text for ONE locale and keeps the others, so editing a step name in English does
 * not drop its Spanish text. A plain string edited in Spanish stays a plain string.
 */
export function withLocalizedText(
  previous: LocalizedText | undefined,
  locale: string,
  text: string,
): LocalizedText {
  // Unchanged text keeps its exact shape (a plain string is not turned into a map).
  if (previous !== undefined && localizedText(previous, locale) === text) return previous;
  if (previous === undefined || typeof previous === 'string') {
    if (locale !== 'en' || previous === undefined) return text;
    return { es: previous, en: text };
  }
  return locale === 'en' ? { ...previous, en: text } : { ...previous, es: text };
}

/** Every text the value holds (Spanish first, then English when present). */
export function allTexts(value: LocalizedText): string[] {
  if (typeof value === 'string') return [value];
  return value.en === undefined ? [value.es] : [value.es, value.en];
}

/** True when any language version of the value is blank (a cleared English name is an error too). */
export function isBlankText(value: LocalizedText): boolean {
  return allTexts(value).some((text) => text.trim() === '');
}

/**
 * The text an editor field shows for `locale`: unlike `localizedText`, an English text being typed
 * (even empty) is shown as is; only a missing translation falls back to Spanish.
 */
export function editableText(value: LocalizedText, locale: string): string {
  if (typeof value === 'string') return value;
  return locale === 'en' && value.en !== undefined ? value.en : value.es;
}

/** True when the value carries a non-empty English translation. */
export function hasEnglish(value: LocalizedText | undefined): boolean {
  return value !== undefined && typeof value !== 'string' && (value.en ?? '') !== '';
}

/**
 * Photo poses: the Spanish text is the STABLE id stored with each photo (`frente`), the localized
 * text is only the label. Returns the ids and an id -> label map.
 */
export function poseEntries(
  poses: readonly LocalizedText[],
  locale: string,
): { ids: string[]; names: Record<string, string> } {
  const names: Record<string, string> = {};
  const ids = poses.map((pose) => {
    const id = sourceText(pose);
    const label = localizedText(pose, locale);
    names[id] = label.charAt(0).toUpperCase() + label.slice(1);
    return id;
  });
  return { ids, names };
}

/** Keys whose values are user-facing template text (strings or `{ es, en? }`). */
export const TEXT_KEYS: ReadonlySet<string> = new Set([
  'name',
  'how',
  'waitReason',
  'reps',
  'weightHint',
  'approach',
  'label',
  'unit',
  'title',
  'body',
  'action',
  'text',
  'prompt',
  'guide',
  'poses',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every template text field under `value`, with its JSON path (`_` author notes skipped). */
export function collectTextFields(
  value: unknown,
  path: (string | number)[] = [],
  textKey = false,
): { path: (string | number)[]; value: unknown }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectTextFields(item, [...path, index], textKey));
  }
  if (textKey && (typeof value === 'string' || isRecord(value))) return [{ path, value }];
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key.startsWith('_') ? [] : collectTextFields(child, [...path, key], TEXT_KEYS.has(key)),
  );
}

/**
 * Merges the same structure rendered in Spanish and in English (e.g. a generated program, whose
 * texts come from i18n) into one value whose differing text fields are `{ es, en }`. Everything
 * else (ids, numbers, identical texts) is taken from the Spanish side.
 */
export function mergeLocales<T>(es: T, en: T): T {
  return mergeValue(es, en, false) as T;
}

function mergeValue(es: unknown, en: unknown, textKey: boolean): unknown {
  if (Array.isArray(es)) {
    return es.map((item: unknown, index) =>
      mergeValue(item, Array.isArray(en) ? (en[index] as unknown) : undefined, textKey),
    );
  }
  if (textKey && typeof es === 'string') {
    return typeof en === 'string' && en !== es ? { es, en } : es;
  }
  if (!isRecord(es)) return es;
  const other = isRecord(en) ? en : {};
  return Object.fromEntries(
    Object.entries(es).map(([key, child]) => [
      key,
      textKey ? child : mergeValue(child, other[key], TEXT_KEYS.has(key)),
    ]),
  );
}

/**
 * Upgrades plain-string text fields whose text is in `dictionary` (Spanish -> English) to
 * `{ es, en }`. Texts the person wrote themselves are not in it and stay as they are.
 */
export function addKnownTranslations<T>(value: T, dictionary: ReadonlyMap<string, string>): T {
  return translateValue(value, dictionary, false) as T;
}

function translateValue(
  value: unknown,
  dictionary: ReadonlyMap<string, string>,
  textKey: boolean,
): unknown {
  if (Array.isArray(value)) return value.map((item) => translateValue(item, dictionary, textKey));
  if (textKey && typeof value === 'string') {
    const en = dictionary.get(value);
    return en === undefined ? value : { es: value, en };
  }
  if (!isRecord(value) || textKey) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key.startsWith('_') ? child : translateValue(child, dictionary, TEXT_KEYS.has(key)),
    ]),
  );
}
