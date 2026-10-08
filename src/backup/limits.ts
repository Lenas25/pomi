// Size caps checked BEFORE a picked file is read into memory (pure, so it is unit tested).
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_PROGRAM_BYTES = 1024 * 1024;

/** A picked file is bigger than the screen accepts. */
export class FileTooLargeError extends Error {
  constructor(
    readonly maxBytes: number,
    readonly actualBytes: number,
  ) {
    super(`File is ${actualBytes} bytes, the limit is ${maxBytes}`);
    this.name = 'FileTooLargeError';
  }
}

/** Throws `FileTooLargeError` when `size` is known and above `maxBytes`. */
export function assertFileSize(size: number | null | undefined, maxBytes: number): void {
  if (typeof size === 'number' && size > maxBytes) throw new FileTooLargeError(maxBytes, size);
}

/** Megabytes for the message, rounded up so "1 MB" is never shown for a 1.2 MB limit. */
export function toMegabytes(bytes: number): number {
  return Math.ceil(bytes / (1024 * 1024));
}

/** `pomi-backup-*.json` files this app exported earlier. */
export function isBackupExportName(name: string): boolean {
  return /^pomi-backup-.*\.json$/.test(name);
}
