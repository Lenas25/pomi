// Photo files live in the app's PRIVATE storage (document directory, `photos/`), never in the
// gallery. This module is pure over a small file-system port (`PhotoFs`), so it is tested with a
// fake; `expoPhotoFs.ts` is the only code that touches expo-file-system for photos.
import type { PhotoRow, PhotosRepository } from '../db/repositories/photos';

export type PhotoFs = {
  /** Moves a file (a fresh camera capture in the cache) into the store under `name`. */
  store(sourceUri: string, name: string): Promise<void>;
  /** Deletes the file; a file that is not there is fine. */
  remove(name: string): void;
  exists(name: string): boolean;
  /** `file://` URI to show the photo. */
  uriOf(name: string): string;
  /** Names of every file in the store. */
  list(): string[];
  /** Size in bytes (0 when missing). */
  size(name: string): number;
  readBase64(name: string): Promise<string>;
  /** Writes to a temporary file and then moves it over `name`, so a half-written photo never exists. */
  writeBase64(name: string, base64: string): Promise<void>;
  /** Deletes a camera capture (cache file) that will not be stored. Never throws. */
  discard(uri: string): void;
};

let lockTail: Promise<unknown> = Promise.resolve();

/**
 * One photo operation at a time (save, delete, sweep, restore of files). Without it the orphan
 * sweep could run between "the file was stored" and "its row was inserted" and delete a photo the
 * person just took. Sequential on purpose; never call it from inside `work`.
 */
export function withPhotoLock<T>(work: () => Promise<T>): Promise<T> {
  const run = lockTail.then(work);
  lockTail = run.catch(() => undefined);
  return run;
}

/** What a stored file name may look like (no folders, so no path tricks from a backup file). */
export const PHOTO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.jpg$/;

export function isSafePhotoName(name: string): boolean {
  return PHOTO_NAME.test(name) && !name.includes('..');
}

/** `2026-10-01-frente-1759300000000.jpg`: ASCII slug of the pose, so any template pose works. */
export function photoFileName(date: string, pose: string, at: number): string {
  const slug =
    pose
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'foto';
  return `${date}-${slug}-${at}.jpg`;
}

export type SavePhotoInput = {
  fs: PhotoFs;
  photos: Pick<PhotosRepository, 'add' | 'forPose' | 'remove'>;
  /** The capture (camera cache file). */
  tempUri: string;
  date: string;
  pose: string;
  now: number;
};

/**
 * Stores a capture for (date, pose). A retake replaces the earlier photo of the same day and
 * pose: the new file and row are saved first, the old ones removed after, so a failure never
 * leaves the person without a photo.
 */
export function savePhoto(input: SavePhotoInput): Promise<PhotoRow> {
  const { fs, photos, tempUri, date, pose, now } = input;
  return withPhotoLock(async () => {
    const name = photoFileName(date, pose, now);
    const earlier = (await photos.forPose(pose)).filter((photo) => photo.date === date);

    await fs.store(tempUri, name);
    let id: number;
    try {
      id = await photos.add({ date, pose, uri: name });
    } catch (error) {
      fs.remove(name);
      throw error;
    }
    for (const old of earlier) {
      await photos.remove(old.id);
      if (old.uri !== name) fs.remove(old.uri);
    }
    return { id, date, pose, uri: name };
  });
}

/**
 * Deletes the photo the person asked to delete: the FILE first, then the row. If removing the file
 * throws, the row stays (nothing changed, the person can retry); if the row cannot be removed
 * afterwards the photo already shows as "not available" and a retry finishes the job. The reverse
 * order could leave a file nobody can see or delete.
 */
export function deletePhoto(
  fs: PhotoFs,
  photos: Pick<PhotosRepository, 'get' | 'remove'>,
  id: number,
): Promise<boolean> {
  return withPhotoLock(async () => {
    const row = await photos.get(id);
    if (!row) return false;
    fs.remove(row.uri);
    await photos.remove(id);
    return true;
  });
}

/** Deletes EVERY photo: all files in the store first, then all rows. Returns how many rows went. */
export function deleteAllPhotos(
  fs: PhotoFs,
  photos: Pick<PhotosRepository, 'count' | 'removeAll'>,
): Promise<number> {
  return withPhotoLock(async () => {
    const total = await photos.count();
    for (const name of fs.list()) fs.remove(name);
    await photos.removeAll();
    return total;
  });
}

/** The most recent photo of `pose` taken BEFORE `date` (the one drawn over the camera). */
export async function previousPhoto(
  photos: Pick<PhotosRepository, 'forPose'>,
  pose: string,
  date: string,
  fs?: Pick<PhotoFs, 'exists'>,
): Promise<PhotoRow | undefined> {
  const earlier = (await photos.forPose(pose)).filter((photo) => photo.date < date);
  return earlier.reverse().find((photo) => fs === undefined || fs.exists(photo.uri));
}

/** Removes files nobody points at (after a restore replaced the rows). Returns how many. */
export function sweepOrphanPhotos(
  fs: PhotoFs,
  photos: Pick<PhotosRepository, 'all'>,
): Promise<number> {
  return withPhotoLock(async () => {
    const used = new Set((await photos.all()).map((photo) => photo.uri));
    let removed = 0;
    for (const name of fs.list()) {
      if (used.has(name)) continue;
      fs.remove(name);
      removed += 1;
    }
    return removed;
  });
}
