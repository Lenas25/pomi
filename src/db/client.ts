import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'pomi.db';

let connection: ExpoSQLiteDatabase<typeof schema> | undefined;

/**
 * The app's single database connection, opened lazily on first use so a failure to open the file
 * surfaces inside the bootstrap (and its error screen) instead of crashing at import time.
 * Import this only from app code, never from domain code.
 */
export function getDatabase(): ExpoSQLiteDatabase<typeof schema> {
  if (connection) return connection;
  const sqlite = openDatabaseSync(DATABASE_NAME);
  try {
    sqlite.execSync('PRAGMA foreign_keys = ON;');
  } catch (error) {
    sqlite.closeSync();
    throw error;
  }
  connection = drizzle(sqlite, { schema });
  return connection;
}
