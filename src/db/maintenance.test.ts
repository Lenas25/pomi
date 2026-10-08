import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories } from './repositories';
import {
  gateRepositories,
  isMaintenanceActive,
  runMaintenance,
  useMaintenanceStore,
  waitForMaintenance,
} from './maintenance';
import { createTestDb } from './testing/createTestDb';
import { withTransaction } from './transaction';
import type { Db } from './types';

let db: Db;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
});

afterEach(() => close());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const tick = () => new Promise<void>((done) => setTimeout(done, 0));

describe('maintenance gate', () => {
  it('lets everything through when idle', async () => {
    await waitForMaintenance();
    expect(isMaintenanceActive()).toBe(false);
    expect(useMaintenanceStore.getState().active).toBe(false);
  });

  it('makes gated repository calls wait until the maintenance run has finished', async () => {
    const repos = gateRepositories(createRepositories(db));
    const started = deferred();
    const proceed = deferred();
    const events: string[] = [];

    const run = runMaintenance(db, async () => {
      events.push('start');
      started.resolve();
      await proceed.promise;
      events.push('end');
    });
    await started.promise;
    expect(isMaintenanceActive()).toBe(true);
    expect(useMaintenanceStore.getState().active).toBe(true);

    const waiting = repos.settings.set('userName', 'Ana').then(() => events.push('write'));
    const reading = waitForMaintenance().then(() => events.push('wait'));
    await tick();
    expect(events).toEqual(['start']);

    proceed.resolve();
    await Promise.all([run, waiting, reading]);
    expect(events.slice(0, 2)).toEqual(['start', 'end']);
    expect(events).toContain('write');
    expect(isMaintenanceActive()).toBe(false);
    expect(useMaintenanceStore.getState().active).toBe(false);
    expect(await repos.settings.get('userName')).toBe('Ana');
  });

  it('waits for a running transaction first, so a gated call inside it cannot deadlock', async () => {
    const repos = gateRepositories(createRepositories(db));
    const order: string[] = [];
    const inFlight = withTransaction(db, async () => {
      await tick();
      // Gate is still down here: maintenance has to queue behind this transaction.
      await repos.settings.set('userName', 'Dentro');
      order.push('transaction');
    });
    const maintenance = runMaintenance(db, async () => {
      order.push('maintenance');
    });
    await Promise.all([inFlight, maintenance]);
    expect(order).toEqual(['transaction', 'maintenance']);
  });

  it('drops the gate and the busy state when the work fails', async () => {
    await expect(
      runMaintenance(db, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(isMaintenanceActive()).toBe(false);
    expect(useMaintenanceStore.getState().active).toBe(false);
    await waitForMaintenance();
  });
});
