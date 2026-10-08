import { describe, expect, it } from '@jest/globals';

import {
  assertFileSize,
  FileTooLargeError,
  isBackupExportName,
  MAX_BACKUP_BYTES,
  MAX_PROGRAM_BYTES,
  toMegabytes,
} from './limits';

describe('file size caps', () => {
  it('accepts files at the limit and unknown sizes, rejects bigger ones', () => {
    expect(() => assertFileSize(MAX_PROGRAM_BYTES, MAX_PROGRAM_BYTES)).not.toThrow();
    expect(() => assertFileSize(undefined, MAX_PROGRAM_BYTES)).not.toThrow();
    expect(() => assertFileSize(null, MAX_PROGRAM_BYTES)).not.toThrow();
    expect(() => assertFileSize(MAX_PROGRAM_BYTES + 1, MAX_PROGRAM_BYTES)).toThrow(
      FileTooLargeError,
    );
  });

  it('keeps the agreed caps and rounds the megabytes up for the message', () => {
    expect(toMegabytes(MAX_BACKUP_BYTES)).toBe(50);
    expect(toMegabytes(MAX_PROGRAM_BYTES)).toBe(1);
    expect(toMegabytes(1.2 * 1024 * 1024)).toBe(2);
  });

  it('recognises only our own exported backups for the stale sweep', () => {
    expect(isBackupExportName('pomi-backup-2026-10-07-1030.json')).toBe(true);
    expect(isBackupExportName('pomi-backup-2026-10-07-1030.json.tmp')).toBe(false);
    expect(isBackupExportName('mi-respaldo.json')).toBe(false);
  });
});
