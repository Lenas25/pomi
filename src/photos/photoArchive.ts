// Photo files are NOT inside the JSON backup (a year of photos would blow its 50 MB cap, and a
// phone photo as base64 is large). They travel as a few separate "pomi-photos" files, each at most
// `PHOTO_PART_BYTES` of base64, shared one after another from Ajustes > Respaldo. Pure over
// `PhotoFs`, so it is tested with a fake file system.
import { z } from 'zod';

import { isSafePhotoName, type PhotoFs } from './photoStore';

export const PHOTO_ARCHIVE_FORMAT = 'pomi-photos';
export const PHOTO_ARCHIVE_VERSION = 1;
/** Budget of base64 characters per part (well under the 50 MB import cap). */
export const PHOTO_PART_BYTES = 20 * 1024 * 1024;

const partSchema = z.strictObject({
  format: z.literal(PHOTO_ARCHIVE_FORMAT),
  version: z.literal(PHOTO_ARCHIVE_VERSION),
  /** 1-based position and total, so the person knows how many files to restore. */
  part: z.number().int().min(1),
  parts: z.number().int().min(1),
  files: z.array(z.strictObject({ name: z.string(), base64: z.string() })),
});

export type PhotoPart = z.infer<typeof partSchema>;

/** How many base64 characters a file of `bytes` takes. */
export const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * Splits the named photos into parts by size (estimated from the file size, no reading yet). A
 * single photo bigger than the budget gets a part of its own.
 */
export function planParts(
  files: readonly { name: string; bytes: number }[],
  budget: number = PHOTO_PART_BYTES,
): string[][] {
  const parts: string[][] = [];
  let current: string[] = [];
  let used = 0;
  for (const file of files) {
    const cost = base64Length(file.bytes);
    if (current.length > 0 && used + cost > budget) {
      parts.push(current);
      current = [];
      used = 0;
    }
    current.push(file.name);
    used += cost;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** Reads the photos of one planned part into the text of its file. */
export async function buildPart(
  fs: Pick<PhotoFs, 'readBase64'>,
  names: readonly string[],
  part: number,
  parts: number,
): Promise<string> {
  const files = [];
  for (const name of names) files.push({ name, base64: await fs.readBase64(name) });
  const document: PhotoPart = {
    format: PHOTO_ARCHIVE_FORMAT,
    version: PHOTO_ARCHIVE_VERSION,
    part,
    parts,
    files,
  };
  return JSON.stringify(document);
}

export type PhotoPartResult =
  { ok: true; part: PhotoPart } | { ok: false; reason: 'invalidJson' | 'notPhotos' | 'invalid' };

/** Validates the text of a picked file: format, version and every file name. */
export function parsePart(text: string): PhotoPartResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalidJson' };
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    !('format' in json) ||
    json.format !== PHOTO_ARCHIVE_FORMAT
  ) {
    return { ok: false, reason: 'notPhotos' };
  }
  const parsed = partSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  if (parsed.data.files.some((file) => !isSafePhotoName(file.name) || file.base64 === '')) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, part: parsed.data };
}

/** Writes the files of a validated part into the store. Returns how many were written. */
export function restorePart(fs: Pick<PhotoFs, 'writeBase64'>, part: PhotoPart): number {
  for (const file of part.files) fs.writeBase64(file.name, file.base64);
  return part.files.length;
}
