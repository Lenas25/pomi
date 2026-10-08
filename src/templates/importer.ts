import type { z } from 'zod';

import {
  CUSTOM_CODES,
  TEMPLATE_SCHEMA_VERSION,
  moduleTemplateSchema,
  modulesTemplateSchema,
  settingsTemplateSchema,
  type ModuleTemplate,
  type Template,
} from './schema';

/** Stable error codes. `describeImportError` maps them to i18n keys. */
export type ImportErrorCode =
  | 'invalidJson'
  | 'notObject'
  | 'unknownKind'
  | 'unsupportedVersion'
  | 'missing'
  | 'wrongType'
  | 'invalidValue'
  | 'tooSmall'
  | 'tooBig'
  | 'invalidFormat'
  | 'invalidTime'
  | 'invalidIcon'
  | 'invalidSchedule'
  | 'invalidScale'
  | 'duplicateId'
  | 'unknownKey'
  | 'unknown';

export type ImportError = {
  code: ImportErrorCode;
  /** JSON path such as `programs[0].routines[1].steps[3].reps`. Empty string = whole file. */
  path: string;
  /** Extra values for the message (expected type, allowed values, limits...). */
  params: Record<string, string | number>;
  /** 1-based line, only for syntax errors found while parsing text. */
  line?: number;
};

export type ImportResult =
  | { ok: true; template: Template }
  | { ok: false; errors: ImportError[] };

const MAX_ERRORS = 50;

const KIND_SCHEMAS = {
  module: moduleTemplateSchema,
  modules: modulesTemplateSchema,
  settings: settingsTemplateSchema,
} as const;

type PathKey = string | number | symbol;

export function formatPath(path: readonly PathKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    const name = String(key);
    return acc === '' ? name : `${acc}.${name}`;
  }, '');
}

function valueAt(root: unknown, path: readonly PathKey[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<PathKey, unknown>)[key];
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Removes author comment keys (`_note`, ...) at every depth, without mutating the input. */
function stripCommentKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCommentKeys);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, inner]) => [key, stripCommentKeys(inner)]),
  );
}

function mapCustomMessage(message: string): ImportErrorCode | null {
  switch (message) {
    case CUSTOM_CODES.time:
      return 'invalidTime';
    case CUSTOM_CODES.icon:
      return 'invalidIcon';
    case CUSTOM_CODES.schedule:
      return 'invalidSchedule';
    case CUSTOM_CODES.scale:
      return 'invalidScale';
    case CUSTOM_CODES.duplicateId:
      return 'duplicateId';
    default:
      return null;
  }
}

function issueToErrors(
  issue: z.core.$ZodIssue,
  input: unknown,
  basePath: readonly PathKey[],
): ImportError[] {
  const fullPath = [...basePath, ...issue.path];
  const path = formatPath(fullPath);
  const make = (
    code: ImportErrorCode,
    params: Record<string, string | number> = {},
  ): ImportError[] => [{ code, path, params }];

  const custom = mapCustomMessage(issue.message);
  if (custom !== null) return make(custom);

  if (valueAt(input, fullPath) === undefined) return make('missing');

  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map((key) => ({
        code: 'unknownKey' as const,
        path: formatPath([...fullPath, key]),
        params: {},
      }));
    case 'invalid_type':
      return make('wrongType', { expected: String(issue.expected) });
    case 'invalid_value':
      return make('invalidValue', { allowed: issue.values.map(String).join(', ') });
    case 'too_small':
      return make('tooSmall', { min: Number(issue.minimum) });
    case 'too_big':
      return make('tooBig', { max: Number(issue.maximum) });
    case 'invalid_format':
      return make('invalidFormat');
    case 'invalid_union': {
      if (issue.errors.length === 0) return make('invalidValue');
      // Report the most specific branch: the one with the fewest problems.
      const best = issue.errors.reduce((a, b) => (b.length < a.length ? b : a));
      return best.flatMap((inner) => issueToErrors(inner, input, fullPath));
    }
    default:
      return make('unknown');
  }
}

/** Validates an already-parsed JSON value. Pure: no I/O, no Expo imports. */
export function importTemplate(json: unknown): ImportResult {
  if (!isPlainObject(json)) {
    return { ok: false, errors: [{ code: 'notObject', path: '', params: {} }] };
  }

  const kind = json.kind;
  if (kind !== 'module' && kind !== 'modules' && kind !== 'settings') {
    return { ok: false, errors: [{ code: 'unknownKind', path: 'kind', params: {} }] };
  }

  if (json.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          code: 'unsupportedVersion',
          path: 'schemaVersion',
          params: {
            found: json.schemaVersion === undefined ? '—' : String(json.schemaVersion),
            expected: TEMPLATE_SCHEMA_VERSION,
          },
        },
      ],
    };
  }

  const clean = stripCommentKeys(json);
  const parsed = KIND_SCHEMAS[kind].safeParse(clean);
  if (parsed.success) return { ok: true, template: parsed.data };

  const errors = parsed.error.issues.flatMap((issue) => issueToErrors(issue, clean, []));
  return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
}

function lineFromSyntaxError(text: string, error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const lineMatch = /line (\d+)/i.exec(error.message);
  if (lineMatch?.[1]) return Number(lineMatch[1]);
  const positionMatch = /position (\d+)/i.exec(error.message);
  if (!positionMatch?.[1]) return undefined;
  return text.slice(0, Number(positionMatch[1])).split('\n').length;
}

/** Parses JSON text first (reporting the line of a syntax error), then validates it. */
export function importTemplateFromText(text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const line = lineFromSyntaxError(text, error);
    return {
      ok: false,
      errors: [{ code: 'invalidJson', path: '', params: {}, ...(line ? { line } : {}) }],
    };
  }
  return importTemplate(json);
}

/** Flattens any module-bearing template into standalone module templates (bundles are split). */
export function toModuleTemplates(template: Template): ModuleTemplate[] {
  switch (template.kind) {
    case 'module':
      return [template];
    case 'modules':
      return template.modules.map((body) => ({
        schemaVersion: TEMPLATE_SCHEMA_VERSION,
        kind: 'module' as const,
        ...body,
      }));
    case 'settings':
      return [];
  }
}
