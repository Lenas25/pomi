import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { migrations } from '../migrations.generated';
import * as schema from '../schema';
import type { Db } from '../types';

/**
 * In-memory SQLite for Jest using Node's built-in `node:sqlite` (no native module needed), exposed
 * through Drizzle's sqlite-proxy driver. Test-only: never import from app code.
 */
export function createTestDb(): { db: Db; close: () => void } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  for (const sql of Object.values(migrations.migrations)) {
    for (const statement of sql.split('--> statement-breakpoint')) sqlite.exec(statement);
  }

  const db = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      const args = params as SQLInputValue[];
      if (method === 'run') {
        statement.run(...args);
        return { rows: [] };
      }
      statement.setReturnArrays(true);
      if (method === 'get')
        return { rows: (statement.get(...args) as unknown[] | undefined) ?? [] };
      return { rows: statement.all(...args) as unknown as unknown[][] };
    },
    { schema },
  );

  return { db, close: () => sqlite.close() };
}
