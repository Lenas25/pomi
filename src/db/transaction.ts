import { sql } from 'drizzle-orm';

import type { Db } from './types';

const depths = new WeakMap<Db, number>();

/**
 * Runs `work` inside a transaction on either driver. Drizzle's own `db.transaction` is
 * synchronous on expo-sqlite and asynchronous on the test proxy, so this issues
 * BEGIN / COMMIT / ROLLBACK through `db.run` instead. Nested calls use savepoints.
 *
 * Caveat: the connection is shared, so unrelated queries awaited while `work` is pending run
 * inside the same transaction. Keep `work` short and only await repository calls.
 */
export async function withTransaction<T>(db: Db, work: () => Promise<T>): Promise<T> {
  const depth = depths.get(db) ?? 0;
  const savepoint = `sp${depth}`;
  await db.run(depth === 0 ? sql`begin` : sql.raw(`savepoint ${savepoint}`));
  depths.set(db, depth + 1);
  try {
    const result = await work();
    depths.set(db, depth);
    await db.run(depth === 0 ? sql`commit` : sql.raw(`release savepoint ${savepoint}`));
    return result;
  } catch (error) {
    depths.set(db, depth);
    await db.run(depth === 0 ? sql`rollback` : sql.raw(`rollback to savepoint ${savepoint}`));
    throw error;
  }
}
