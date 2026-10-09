// Turns the text of a picked file into a validated `Backup`, or into readable errors. Pure.
import { settingsSchemas } from '../db/repositories/settings';
import {
  importTemplate,
  issueToErrors,
  lineFromSyntaxError,
  type ImportError,
} from '../templates/importer';

import {
  isValidInsightEvidence,
  isValidReminderSchedule,
  isValidSuggestionPayload,
} from './payloads';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  backupSchema,
  isKnownSetting,
  REMOVED_SETTINGS,
  type Backup,
} from './schema';

export type BackupError =
  | {
      kind: 'file';
      code: 'invalidJson' | 'notBackup' | 'olderVersion' | 'newerVersion';
      /** 1-based line of a JSON syntax error. */
      line?: number;
      /** Version found in the file (version errors). */
      found?: number;
    }
  | { kind: 'field'; error: ImportError };

export type ParseBackupResult = { ok: true; backup: Backup } | { ok: false; errors: BackupError[] };

const MAX_ERRORS = 20;

type BackupJson = Record<string, unknown>;

/** `BACKUP_MIGRATIONS[n]` upgrades a file written with schema version `n` to `n + 1`. */
export type BackupMigrationTable = Readonly<Record<number, (json: BackupJson) => BackupJson>>;

/**
 * Upgrade steps for older backups. Empty today (version 1 is the first). When the schema changes,
 * bump `BACKUP_SCHEMA_VERSION` and add `[previousVersion]: (json) => ...newJson` here, so files
 * written by earlier app versions keep restoring.
 */
export const BACKUP_MIGRATIONS: BackupMigrationTable = {};

/**
 * Walks `json` from `version` up to `target` through the migration chain. `null` when a step is
 * missing (the version is too old to read). Each step's result is stamped with the new version.
 */
export function migrateBackupJson(
  json: BackupJson,
  version: number,
  target: number = BACKUP_SCHEMA_VERSION,
  migrations: BackupMigrationTable = BACKUP_MIGRATIONS,
): BackupJson | null {
  let current = json;
  for (let from = version; from < target; from += 1) {
    const step = migrations[from];
    if (!step) return null;
    current = { ...step(current), schemaVersion: from + 1 };
  }
  return current;
}

function field(code: ImportError['code'], path: string): BackupError {
  return { kind: 'field', error: { code, path, params: {} } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks that reach into other validators (settings values, templates) or across tables. */
function crossChecks(backup: Backup): BackupError[] {
  const errors: BackupError[] = [];

  backup.data.settings.forEach((row, index) => {
    const base = `data.settings[${index}]`;
    // A removed feature's key (older files): accepted here, dropped by the restore.
    if (REMOVED_SETTINGS.includes(row.key)) return;
    if (!isKnownSetting(row.key)) {
      errors.push(field('unknownKey', `${base}.key`));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      errors.push(field('invalidJson', `${base}.value`));
      return;
    }
    if (!settingsSchemas[row.key].safeParse(parsed).success) {
      errors.push(field('invalidValue', `${base}.value`));
    }
  });

  backup.data.templates.forEach((row, index) => {
    const base = `data.templates[${index}].json`;
    const result = importTemplate(row.json);
    if (!result.ok) {
      for (const error of result.errors) {
        errors.push({
          kind: 'field',
          error: { ...error, path: error.path === '' ? base : `${base}.${error.path}` },
        });
      }
    } else if (result.template.kind !== row.kind) {
      errors.push(field('invalidValue', `data.templates[${index}].kind`));
    }
  });

  const sessionIds = new Set(backup.data.workoutSessions.map((session) => session.id));
  backup.data.setLogs.forEach((row, index) => {
    if (!sessionIds.has(row.sessionId)) {
      errors.push(field('invalidValue', `data.setLogs[${index}].sessionId`));
    }
  });

  backup.data.suggestions.forEach((row, index) => {
    if (!isValidSuggestionPayload(row.kind, row.payload)) {
      errors.push(field('invalidValue', `data.suggestions[${index}].payload`));
    }
  });
  backup.data.insights.forEach((row, index) => {
    if (!isValidInsightEvidence(row.evidence)) {
      errors.push(field('invalidValue', `data.insights[${index}].evidence`));
    }
  });
  backup.data.reminders.forEach((row, index) => {
    if (!isValidReminderSchedule(row.schedule)) {
      errors.push(field('invalidValue', `data.reminders[${index}].schedule`));
    }
  });

  return errors;
}

/** Parses and validates backup file text. Older and newer versions are rejected with their own error. */
export function parseBackupText(text: string): ParseBackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const line = lineFromSyntaxError(text, error);
    return {
      ok: false,
      errors: [{ kind: 'file', code: 'invalidJson', ...(line ? { line } : {}) }],
    };
  }

  if (!isRecord(json) || json.format !== BACKUP_FORMAT) {
    return { ok: false, errors: [{ kind: 'file', code: 'notBackup' }] };
  }
  const version = json.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, errors: [field('invalidValue', 'schemaVersion')] };
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    return { ok: false, errors: [{ kind: 'file', code: 'newerVersion', found: version }] };
  }
  if (version < BACKUP_SCHEMA_VERSION) {
    const migrated = migrateBackupJson(json, version);
    if (migrated === null) {
      return { ok: false, errors: [{ kind: 'file', code: 'olderVersion', found: version }] };
    }
    json = migrated;
  }

  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .flatMap((issue) => issueToErrors(issue, json, []))
      .slice(0, MAX_ERRORS)
      .map((error): BackupError => ({ kind: 'field', error }));
    return { ok: false, errors };
  }

  const crossed = crossChecks(parsed.data);
  if (crossed.length > 0) return { ok: false, errors: crossed.slice(0, MAX_ERRORS) };
  return { ok: true, backup: parsed.data };
}
