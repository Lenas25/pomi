import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'pomi.db';

const sqlite = openDatabaseSync(DATABASE_NAME);
sqlite.execSync('PRAGMA foreign_keys = ON;');

/** The app's single database connection. Import this only from app code, never from domain code. */
export const db = drizzle(sqlite, { schema });
