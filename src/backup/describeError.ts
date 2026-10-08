import type { TranslationKey } from '../i18n/types';
import { describeImportError, type Translate } from '../templates/describeError';

import type { BackupError } from './parse';
import { BACKUP_SCHEMA_VERSION } from './schema';

/** Turns a backup problem into a plain-language sentence in the active language. */
export function describeBackupError(error: BackupError, translate: Translate): string {
  if (error.kind === 'field') return describeImportError(error.error, translate);
  const key: TranslationKey = (
    {
      invalidJson: 'backup.errors.invalidJson',
      notBackup: 'backup.errors.notBackup',
      olderVersion: 'backup.errors.olderVersion',
      newerVersion: 'backup.errors.newerVersion',
    } as const
  )[error.code];
  return translate(key, {
    ...(error.line !== undefined ? { line: error.line } : {}),
    found: error.found ?? '',
    expected: BACKUP_SCHEMA_VERSION,
  });
}
