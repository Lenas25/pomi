import { inArray } from 'drizzle-orm';

import { settings } from './schema';
import type { Db } from './types';

/**
 * Settings keys of features the owner removed ("Conectar mi IA" and its chat history). Databases
 * written by an old build may still hold them.
 */
export const REMOVED_SETTINGS: readonly string[] = ['aiConnection', 'aiChat'];

/** Deletes the removed settings rows. Idempotent: runs on every bootstrap, after the migrations. */
export async function removeLegacySettings(db: Db): Promise<void> {
  await db.delete(settings).where(inArray(settings.key, [...REMOVED_SETTINGS]));
}
