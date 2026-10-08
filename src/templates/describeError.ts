import type { TranslationKey } from '../i18n/types';

import type { ImportError } from './importer';

export type Translate = (key: TranslationKey, options?: Record<string, string | number>) => string;

const TYPE_KEYS = {
  string: 'importErrors.types.string',
  number: 'importErrors.types.number',
  int: 'importErrors.types.integer',
  boolean: 'importErrors.types.boolean',
  array: 'importErrors.types.array',
  object: 'importErrors.types.object',
} as const satisfies Record<string, TranslationKey>;

function typeLabel(expected: string, translate: Translate): string {
  const key = (TYPE_KEYS as Record<string, TranslationKey>)[expected];
  return translate(key ?? 'importErrors.types.value');
}

/** Turns an import error into a plain-language sentence in the active language. */
export function describeImportError(error: ImportError, translate: Translate): string {
  const path = error.path === '' ? translate('importErrors.root') : error.path;
  const base = { path };
  const { params } = error;

  switch (error.code) {
    case 'invalidJson':
      return error.line === undefined
        ? translate('importErrors.invalidJson')
        : translate('importErrors.invalidJsonAtLine', { line: error.line });
    case 'notObject':
      return translate('importErrors.notObject');
    case 'unknownKind':
      return translate('importErrors.unknownKind');
    case 'unsupportedVersion':
      return translate('importErrors.unsupportedVersion', {
        found: params.found ?? '',
        expected: params.expected ?? '',
      });
    case 'missing':
      return translate('importErrors.missing', base);
    case 'wrongType':
      return translate('importErrors.wrongType', {
        ...base,
        expected: typeLabel(String(params.expected ?? ''), translate),
      });
    case 'invalidValue':
      return params.allowed
        ? translate('importErrors.invalidValueWithOptions', { ...base, allowed: params.allowed })
        : translate('importErrors.invalidValue', base);
    case 'tooSmall':
      return params.inclusive === 0
        ? translate('importErrors.tooSmallExclusive', { ...base, min: params.min ?? 0 })
        : translate('importErrors.tooSmall', { ...base, min: params.min ?? 0 });
    case 'tooBig':
      return params.inclusive === 0
        ? translate('importErrors.tooBigExclusive', { ...base, max: params.max ?? 0 })
        : translate('importErrors.tooBig', { ...base, max: params.max ?? 0 });
    case 'invalidFormat':
      return translate('importErrors.invalidFormat', base);
    case 'invalidTime':
      return translate('importErrors.invalidTime', base);
    case 'invalidIcon':
      return translate('importErrors.invalidIcon', base);
    case 'invalidSchedule':
      return translate('importErrors.invalidSchedule', base);
    case 'invalidScale':
      return translate('importErrors.invalidScale', base);
    case 'duplicateId':
      return translate('importErrors.duplicateId', base);
    case 'invalidCondition':
      return translate('importErrors.invalidCondition', base);
    case 'flagValueWithoutFlag':
      return translate('importErrors.flagValueWithoutFlag', base);
    case 'repsLanguagesDiffer':
      return translate('importErrors.repsLanguagesDiffer', base);
    case 'unknownKey':
      return translate('importErrors.unknownKey', base);
    case 'unknown':
      return translate('importErrors.unknown', base);
  }
}
