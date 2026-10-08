// Removes photo files nobody points at (a crash between "file stored" and "row inserted", a half
// written restore `.tmp`). Runs once per app start, after the database is ready. Repository calls
// wait for the maintenance gate and the sweep takes the photo lock, so it cannot race a restore or
// a photo being saved.
import { getRepositories } from '../db';

import { expoPhotoFs } from './expoPhotoFs';
import { sweepOrphanPhotos } from './photoStore';

let started = false;

export function sweepOrphanPhotosAtStart(): void {
  if (started) return;
  started = true;
  sweepOrphanPhotos(expoPhotoFs, getRepositories().photos).catch((error: unknown) => {
    started = false;
    if (__DEV__) console.warn('Could not sweep orphan photos', error);
  });
}
