import { sql } from 'drizzle-orm';

import type { Db } from './types';

/**
 * Handle passed to a transaction callback. Hand it to `withTransaction` again to nest (a
 * savepoint); passing the plain `Db` always starts a NEW top-level transaction instead.
 */
export class Tx {
  /** @internal Use `withTransaction`. */
  constructor(
    readonly db: Db,
    readonly depth: number,
  ) {}
}

/** Per-connection queue tail: top-level transactions run one after another. */
const queues = new WeakMap<Db, Promise<unknown>>();

async function execute<T>(
  db: Db,
  depth: number,
  work: (tx: Tx) => Promise<T>,
  nextSavepoint: () => string,
): Promise<T> {
  const savepoint = depth === 0 ? undefined : nextSavepoint();
  await db.run(savepoint ? sql.raw(`savepoint ${savepoint}`) : sql`begin`);
  try {
    const result = await work(new Tx(db, depth + 1));
    await db.run(savepoint ? sql.raw(`release savepoint ${savepoint}`) : sql`commit`);
    return result;
  } catch (error) {
    try {
      if (savepoint) {
        await db.run(sql.raw(`rollback to savepoint ${savepoint}`));
        // ROLLBACK TO keeps the savepoint on the stack; release it so the outer one stays clean.
        await db.run(sql.raw(`release savepoint ${savepoint}`));
      } else {
        await db.run(sql`rollback`);
      }
    } catch {
      // The rollback itself failed (e.g. the connection already ended the transaction). The
      // caller must see the ORIGINAL failure, not this one.
    }
    throw error;
  }
}

let savepointCounter = 0;
const nextSavepoint = () => `sp${(savepointCounter += 1)}`;

/**
 * Runs `work` inside a transaction on either driver. Drizzle's own `db.transaction` is
 * synchronous on expo-sqlite and asynchronous on the test proxy, so this issues
 * BEGIN / COMMIT / ROLLBACK through `db.run` instead.
 *
 * - `withTransaction(db, work)` is a TOP-LEVEL transaction. Concurrent top-level calls on the
 *   same `Db` are queued (a promise-chain mutex), so two callers never interleave statements in
 *   one BEGIN. Never start a top-level transaction from inside `work`: it would wait for itself.
 * - `withTransaction(tx, work)` (the `tx` handed to `work`) nests through a savepoint; a failure
 *   rolls back only the nested part.
 *
 * Caveat: the connection is shared, so unrelated queries awaited while `work` is pending run
 * inside the same transaction. Keep `work` short and only await repository calls.
 */
export function withTransaction<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T>;
export function withTransaction<T>(tx: Tx, work: (tx: Tx) => Promise<T>): Promise<T>;
export function withTransaction<T>(target: Db | Tx, work: (tx: Tx) => Promise<T>): Promise<T>;
export function withTransaction<T>(target: Db | Tx, work: (tx: Tx) => Promise<T>): Promise<T> {
  if (target instanceof Tx) return execute(target.db, target.depth, work, nextSavepoint);

  const previous = queues.get(target) ?? Promise.resolve();
  const run = previous.then(() => execute(target, 0, work, nextSavepoint));
  // The next caller waits for this one to settle, whichever way it ends.
  queues.set(
    target,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
