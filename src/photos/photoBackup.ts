// Export / import of the photo IMAGE files (the JSON backup only carries the rows). Pure over the
// file-system port and an injected `share`, so it runs in Jest without a device.
import type { PhotosRepository } from '../db/repositories/photos';

import { buildPart, parsePart, planParts, restorePart } from './photoArchive';
import { withPhotoLock, type PhotoFs } from './photoStore';

export type ShareFile = (
  fileName: string,
  contents: string,
  dialogTitle: string,
  options: { sweep: boolean },
) => Promise<'shared' | 'unavailable'>;

export type ExportPhotosResult =
  | { status: 'done'; parts: number; photos: number }
  | { status: 'none' }
  | { status: 'unavailable' };

/** `pomi-photos-2026-10-07-1-de-2.json` */
export function photoPartFileName(date: string, part: number, parts: number): string {
  return `pomi-photos-${date}-${part}-de-${parts}.json`;
}

/**
 * Shares every stored photo (rows whose file exists) as one or more part files, one share sheet
 * after another. Stops quietly if sharing is not available.
 */
export async function exportPhotoArchive(deps: {
  fs: PhotoFs;
  photos: Pick<PhotosRepository, 'all'>;
  share: ShareFile;
  dialogTitle: string;
  /** `yyyy-MM-dd` for the file names. */
  today: string;
  partBytes?: number;
}): Promise<ExportPhotosResult> {
  const rows = await deps.photos.all();
  const names = [...new Set(rows.map((row) => row.uri))].filter((name) => deps.fs.exists(name));
  if (names.length === 0) return { status: 'none' };

  const plan = planParts(
    names.map((name) => ({ name, bytes: deps.fs.size(name) })),
    deps.partBytes,
  );
  for (const [index, part] of plan.entries()) {
    const text = await buildPart(deps.fs, part, index + 1, plan.length);
    const outcome = await deps.share(
      photoPartFileName(deps.today, index + 1, plan.length),
      text,
      deps.dialogTitle,
      { sweep: index === 0 },
    );
    if (outcome === 'unavailable') return { status: 'unavailable' };
  }
  return { status: 'done', parts: plan.length, photos: names.length };
}

export type ImportPhotosResult =
  | { status: 'restored'; restored: number; failed: number; part: number; parts: number }
  /** The file is fine but none of its photos belongs to the restored rows. */
  | { status: 'noMatch' }
  /** Matching photos were in the file but none could be written (damaged data or no space). */
  | { status: 'allFailed'; failed: number }
  | { status: 'invalid'; reason: 'invalidJson' | 'notPhotos' | 'invalid' };

/**
 * Writes the files of a picked part that the stored photo rows point at (restore the JSON backup
 * with photos first; a part for photos you do not have rows for is ignored).
 */
export async function importPhotoArchive(deps: {
  fs: PhotoFs;
  photos: Pick<PhotosRepository, 'all'>;
  text: string;
}): Promise<ImportPhotosResult> {
  const parsed = parsePart(deps.text);
  if (!parsed.ok) return { status: 'invalid', reason: parsed.reason };
  const wanted = new Set((await deps.photos.all()).map((row) => row.uri));
  const files = parsed.part.files.filter((file) => wanted.has(file.name));
  if (files.length === 0) return { status: 'noMatch' };
  const { restored, failed } = await withPhotoLock(() =>
    restorePart(deps.fs, { ...parsed.part, files }),
  );
  if (restored === 0) return { status: 'allFailed', failed };
  return {
    status: 'restored',
    restored,
    failed,
    part: parsed.part.part,
    parts: parsed.part.parts,
  };
}
