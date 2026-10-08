// Stable pose ids for stored photos: older versions keyed a photo by the pose label text.
import type { PhotosRepository } from '../db/repositories/photos';
import type { StoredModule } from '../db/repositories/templates';
import { legacyPoseIds, type PoseSpec } from '../templates/localized';
import type { ModuleTemplate } from '../templates/schema';

/** The poses of the monthly review: the first active module with a photo spec. */
export function activePoses(
  modules: readonly Pick<StoredModule, 'active' | 'template'>[],
): PoseSpec[] {
  return activePosesOf(modules.filter((module) => module.active).map((module) => module.template));
}

export function activePosesOf(templates: readonly Pick<ModuleTemplate, 'photos'>[]): PoseSpec[] {
  return templates.map((template) => template.photos).find((spec) => spec)?.poses ?? [];
}

/** Renames photo rows stored under a legacy pose text to the pose id. Idempotent. */
export async function migratePhotoPoseIds(
  photos: Pick<PhotosRepository, 'renamePose'>,
  poses: readonly PoseSpec[],
): Promise<void> {
  for (const [legacy, id] of legacyPoseIds(poses)) await photos.renamePose(legacy, id);
}

/** The same mapping for photo rows about to be restored from a backup. */
export function mapPhotoPoses<Row extends { pose: string }>(
  rows: readonly Row[],
  poses: readonly PoseSpec[],
): Row[] {
  const map = legacyPoseIds(poses);
  return rows.map((row) => {
    const id = map.get(row.pose);
    return id === undefined ? row : { ...row, pose: id };
  });
}
