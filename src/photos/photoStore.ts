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
  /** Writes a small JPEG (about `THUMBNAIL_WIDTH` px wide) of `name` as `thumbName`. */
  makeThumbnail(name: string, thumbName: string): Promise<void>;
};

/** Width of the grid thumbnails, in px (the full photo stays untouched). */
export const THUMBNAIL_WIDTH = 320;

/** File name of the thumbnail of `name`; still a safe photo name, never used by a row. */
export function thumbnailName(name: string): string {
  return `thumb-${name}`;
}

/** Name of a file and of its thumbnail, to remove them together. */
const withThumbnail = (name: string): string[] => [name, thumbnailName(name)];

let lockTail: Promise<unknown> = Promise.resolve();
let enteringWork = false;

/**
 * One photo operation at a time (save, delete, sweep, restore of files). Without it the orphan
 * sweep could run between "the file was stored" and "its row was inserted" and delete a photo the
 * person just took. Sequential on purpose; never call it from inside `work` (it would wait for
 * itself forever). In development the synchronous part of `work` is checked for that mistake.
 */
export function withPhotoLock<T>(work: () => Promise<T>): Promise<T> {
  if (__DEV__ && enteringWork) {
    throw new Error('withPhotoLock called from inside withPhotoLock: it would deadlock');
  }
  const run = lockTail.then(() => {
    enteringWork = true;
    try {
      return work();
    } finally {
      enteringWork = false;
    }
  });
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
    // Best effort: without a thumbnail the grids show the full photo and backfill it later.
    await fs.makeThumbnail(name, thumbnailName(name)).catch(() => undefined);
    let id: number;
    try {
      id = await photos.add({ date, pose, uri: name });
    } catch (error) {
      removeQuietly(fs, thumbnailName(name));
      fs.remove(name);
      throw error;
    }
    for (const old of earlier) {
      await photos.remove(old.id);
      if (old.uri !== name) {
        fs.remove(old.uri);
        removeQuietly(fs, thumbnailName(old.uri));
      }
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
    removeQuietly(fs, thumbnailName(row.uri));
    await photos.remove(id);
    return true;
  });
}

/** Removes a derived file; a failure only leaves an orphan that the sweep collects. */
function removeQuietly(fs: Pick<PhotoFs, 'remove'>, name: string): void {
  try {
    fs.remove(name);
  } catch {
    // Swept as an orphan later.
  }
}

export type DeleteAllResult = {
  /** Rows there were. */
  total: number;
  /** Rows (and files) removed. */
  deleted: number;
  /** Rows kept because their file could not be removed. */
  failed: number;
};

/**
 * Deletes EVERY photo, one by one: the file (and its thumbnail) first, then its row. A row is
 * removed only when its file is gone, so a file that cannot be deleted stays visible and the
 * person can retry; the others still go. Files nobody points at are removed too.
 */
export function deleteAllPhotos(
  fs: PhotoFs,
  photos: Pick<PhotosRepository, 'all' | 'removeMany'>,
): Promise<DeleteAllResult> {
  return withPhotoLock(async () => {
    const rows = await photos.all();
    const gone: number[] = [];
    for (const row of rows) {
      try {
        fs.remove(row.uri);
        if (fs.exists(row.uri)) continue;
      } catch {
        continue;
      }
      removeQuietly(fs, thumbnailName(row.uri));
      gone.push(row.id);
    }
    await photos.removeMany(gone);
    const kept = new Set(
      rows.filter((row) => !gone.includes(row.id)).flatMap((r) => withThumbnail(r.uri)),
    );
    for (const name of fs.list()) if (!kept.has(name)) removeQuietly(fs, name);
    return { total: rows.length, deleted: gone.length, failed: rows.length - gone.length };
  });
}

const thumbnailFailures = new Set<string>();

/**
 * Creates the thumbnail of `name` when the photo is there and the thumbnail is not (photos taken
 * before thumbnails existed). Returns whether a thumbnail now exists; a photo that failed once is
 * not retried until the app restarts.
 */
export function ensureThumbnail(fs: PhotoFs, name: string): Promise<boolean> {
  const thumb = thumbnailName(name);
  if (fs.exists(thumb)) return Promise.resolve(true);
  if (thumbnailFailures.has(name)) return Promise.resolve(false);
  return withPhotoLock(async () => {
    if (fs.exists(thumb)) return true;
    if (!fs.exists(name)) return false;
    try {
      await fs.makeThumbnail(name, thumb);
      return fs.exists(thumb);
    } catch {
      thumbnailFailures.add(name);
      return false;
    }
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
    const used = new Set((await photos.all()).flatMap((photo) => withThumbnail(photo.uri)));
    let removed = 0;
    for (const name of fs.list()) {
      if (used.has(name)) continue;
      fs.remove(name);
      removed += 1;
    }
    return removed;
  });
}
