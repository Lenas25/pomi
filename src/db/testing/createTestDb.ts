import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { migrations } from '../migrations.generated';
import * as schema from '../schema';
import type { Db } from '../types';

type Migration = { sql: string[]; bps: boolean; folderMillis: number; hash: string };

/** Mirrors drizzle's expo migrator input so the REAL dialect migrator (journal, hash table, transaction) runs. */
function readMigrations(): Migration[] {
  return migrations.journal.entries.map((entry) => {
    const sqlText = (migrations.migrations as Record<string, string>)[
      `m${String(entry.idx).padStart(4, '0')}`
    ];
    if (!sqlText) throw new Error(`Missing migration: ${entry.tag}`);
    return {
      sql: sqlText.split('--> statement-breakpoint'),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: '',
    };
  });
}

type Migratable = {
  dialect: { migrate(m: Migration[], session: unknown): Promise<void> };
  session: unknown;
};

/** Applies the bundled migrations with drizzle's own migrator, exactly as the app does on device. */
export async function applyMigrations(db: Db): Promise<void> {
  const internals = db as unknown as Migratable;
  await internals.dialect.migrate(readMigrations(), internals.session);
}

/**
 * In-memory SQLite for Jest using Node's built-in `node:sqlite` (no native module needed), exposed
 * through Drizzle's sqlite-proxy driver. Test-only: never import from app code.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => void }> {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

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

  await applyMigrations(db);
  return { db, close: () => sqlite.close() };
}
