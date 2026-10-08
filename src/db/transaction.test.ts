import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { sql } from 'drizzle-orm';

import { createTestDb } from './testing/createTestDb';
import { createSettingsRepository } from './repositories/settings';
import { withTransaction } from './transaction';
import type { Db } from './types';

let db: Db;
let close: () => void;
let settings: ReturnType<typeof createSettingsRepository>;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  settings = createSettingsRepository(db);
});

afterEach(() => close());

/** Yields to the event loop a few times so queued work can interleave if it is going to. */
async function tick(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

describe('withTransaction', () => {
  it('commits on success and rolls back on failure', async () => {
    await withTransaction(db, async () => settings.set('themeMode', 'dark'));
    expect(await settings.get('themeMode')).toBe('dark');

    await expect(
      withTransaction(db, async () => {
        await settings.set('themeMode', 'light');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await settings.get('themeMode')).toBe('dark');
  });

  it('rethrows the ORIGINAL error when the rollback itself fails', async () => {
    const original = new Error('original failure');
    await expect(
      withTransaction(db, async () => {
        await settings.set('themeMode', 'light');
        // Ends the transaction behind the helper's back, so its own ROLLBACK will fail.
        await db.run(sql`rollback`);
        throw original;
      }),
    ).rejects.toBe(original);
    // The helper is still usable afterwards.
    await withTransaction(db, async () => settings.set('themeMode', 'dark'));
    expect(await settings.get('themeMode')).toBe('dark');
  });

  it('queues concurrent top-level transactions instead of interleaving them', async () => {
    const order: string[] = [];
    const first = withTransaction(db, async () => {
      order.push('first:start');
      await settings.set('themeMode', 'dark');
      await tick();
      order.push('first:end');
    });
    const second = withTransaction(db, async () => {
      order.push('second:start');
      await settings.set('language', 'es');
      order.push('second:end');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(await settings.get('themeMode')).toBe('dark');
    expect(await settings.get('language')).toBe('es');
  });

  it('keeps the queue alive after a failed transaction and isolates its writes', async () => {
    const failing = withTransaction(db, async () => {
      await settings.set('themeMode', 'light');
      await tick();
      throw new Error('first failed');
    });
    const succeeding = withTransaction(db, async () => settings.set('language', 'en'));
    const results = await Promise.allSettled([failing, succeeding]);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    expect(await settings.get('themeMode')).toBeUndefined();
    expect(await settings.get('language')).toBe('en');
  });

  it('nests through the tx handle with savepoints: a nested failure rolls back only itself', async () => {
    await withTransaction(db, async (tx) => {
      await settings.set('themeMode', 'dark');
      await expect(
        withTransaction(tx, async () => {
          await settings.set('language', 'es');
          throw new Error('nested failed');
        }),
      ).rejects.toThrow('nested failed');
      await withTransaction(tx, async () => settings.set('activeModules', ['gym']));
    });
    expect(await settings.get('themeMode')).toBe('dark');
    expect(await settings.get('language')).toBeUndefined();
    expect(await settings.get('activeModules')).toEqual(['gym']);
  });

  it('rolls back nested work too when the outer transaction fails', async () => {
    await expect(
      withTransaction(db, async (tx) => {
        await withTransaction(tx, async () => settings.set('themeMode', 'dark'));
        throw new Error('outer failed');
      }),
    ).rejects.toThrow('outer failed');
    expect(await settings.get('themeMode')).toBeUndefined();
  });

  it('allows deeper nesting', async () => {
    await withTransaction(db, async (outer) => {
      await withTransaction(outer, async (middle) => {
        await withTransaction(middle, async () => settings.set('themeMode', 'light'));
      });
    });
    expect(await settings.get('themeMode')).toBe('light');
  });
});
