import { describe, expect, it } from '@jest/globals';

import { connectAndSync, mergeSteps, recordSteps, syncSteps, type StepsStore } from './sync';
import type { DailySteps, HealthAdapter, HealthAvailability, StepsSourceId } from './types';

type Row = { steps: number; source: StepsSourceId };

function fakeStore(initial: Record<string, Row> = {}): StepsStore & { rows: Record<string, Row> } {
  const rows = { ...initial };
  return {
    rows,
    get: async (date) => rows[date],
    upsert: async (date, steps, source) => {
      rows[date] = { steps, source };
    },
  };
}

function fakeAdapter(
  options: {
    availability?: HealthAvailability;
    granted?: boolean;
    grantsOnRequest?: boolean;
    days?: DailySteps[];
    fail?: boolean;
  } = {},
): HealthAdapter & { requests: number; reads: number } {
  let granted = options.granted ?? false;
  const adapter = {
    id: 'health_connect' as const,
    requests: 0,
    reads: 0,
    getAvailability: async () => options.availability ?? 'available',
    hasPermission: async () => granted,
    requestPermission: async () => {
      adapter.requests += 1;
      granted = options.grantsOnRequest ?? false;
      return granted;
    },
    readDailySteps: async () => {
      adapter.reads += 1;
      if (options.fail) throw new Error('boom');
      return options.days ?? [];
    },
    hasBackgroundPermission: async () => false,
    requestBackgroundPermission: async () => false,
    readRecentSteps: async () => ({ steps: 0, hasRecentData: false }),
    openSettings: () => undefined,
  };
  return adapter;
}

const days: DailySteps[] = [
  { date: '2026-10-05', steps: 6500.4 },
  { date: '2026-10-06', steps: 0 },
];

describe('syncSteps', () => {
  it('writes the days with source health_connect when the permission is granted', async () => {
    const store = fakeStore();
    const outcome = await syncSteps({
      adapter: fakeAdapter({ granted: true, days }),
      store,
      from: '2026-10-05',
      to: '2026-10-06',
    });
    expect(outcome).toEqual({ status: 'synced', updated: 1 });
    expect(store.rows['2026-10-06']).toBeUndefined();
    expect(store.rows['2026-10-05']).toEqual({ steps: 6500, source: 'health_connect' });
  });

  it('keeps the counter manual when the permission is denied (never reads or writes)', async () => {
    const store = fakeStore({ '2026-10-05': { steps: 4000, source: 'manual' } });
    const adapter = fakeAdapter({ granted: false, days });
    const outcome = await syncSteps({ adapter, store, from: '2026-10-05', to: '2026-10-06' });
    expect(outcome).toEqual({ status: 'denied' });
    expect(adapter.reads).toBe(0);
    expect(adapter.requests).toBe(0);
    expect(store.rows).toEqual({ '2026-10-05': { steps: 4000, source: 'manual' } });
  });

  it('reports missing or outdated Health Connect without touching anything', async () => {
    const store = fakeStore();
    for (const availability of ['unavailable', 'update_required'] as const) {
      const outcome = await syncSteps({
        adapter: fakeAdapter({ availability, granted: true, days }),
        store,
        from: 'a',
        to: 'b',
      });
      expect(outcome.status).toBe(availability);
    }
    expect(store.rows).toEqual({});
  });

  it('turns adapter failures into an outcome instead of throwing', async () => {
    const outcome = await syncSteps({
      adapter: fakeAdapter({ granted: true, fail: true }),
      store: fakeStore(),
      from: 'a',
      to: 'b',
    });
    expect(outcome.status).toBe('error');
  });

  it('does not wipe a typed number with a zero from Health Connect', async () => {
    const store = fakeStore({ '2026-10-06': { steps: 3000, source: 'manual' } });
    await syncSteps({
      adapter: fakeAdapter({ granted: true, days }),
      store,
      from: '2026-10-05',
      to: '2026-10-06',
    });
    expect(store.rows['2026-10-06']).toEqual({ steps: 3000, source: 'manual' });
  });
});

describe('mergeSteps / recordSteps', () => {
  const hc = (steps: number): Row => ({ steps, source: 'health_connect' });
  const manual = (steps: number): Row => ({ steps, source: 'manual' });

  it('writes when nothing is stored, except a Health Connect zero (no data)', () => {
    expect(mergeSteps(undefined, hc(5))).toEqual(hc(5));
    expect(mergeSteps(undefined, manual(0))).toEqual(manual(0));
    expect(mergeSteps(undefined, hc(0))).toBeNull();
  });

  it('keeps the larger of manual and Health Connect and records the winning source', () => {
    expect(mergeSteps(manual(5000), hc(3000))).toBeNull();
    expect(mergeSteps(manual(5000), hc(7000))).toEqual(hc(7000));
    expect(mergeSteps(hc(7000), manual(5000))).toBeNull();
    expect(mergeSteps(hc(7000), manual(9000))).toEqual(manual(9000));
    expect(mergeSteps(manual(5000), hc(5000))).toBeNull();
  });

  it('lets the same source correct itself in both directions', () => {
    expect(mergeSteps(manual(5000), manual(4000))).toEqual(manual(4000));
    expect(mergeSteps(hc(7000), hc(6500))).toEqual(hc(6500));
    expect(mergeSteps(hc(7000), hc(7000))).toBeNull();
  });

  it('applies the merge to the store', async () => {
    const store = fakeStore({ d: manual(4000) });
    expect(await recordSteps(store, 'd', 2000, 'health_connect')).toBe(false);
    expect(store.rows['d']).toEqual(manual(4000));
    expect(await recordSteps(store, 'd', 6000, 'health_connect')).toBe(true);
    expect(store.rows['d']).toEqual(hc(6000));
  });
});

describe('connectAndSync', () => {
  it('asks for the permission and syncs when it is granted', async () => {
    const store = fakeStore();
    const adapter = fakeAdapter({ grantsOnRequest: true, days });
    const outcome = await connectAndSync({ adapter, store, from: 'a', to: 'b' });
    expect(adapter.requests).toBe(1);
    expect(outcome).toEqual({ status: 'synced', updated: 1 });
  });

  it('falls back to manual when the person refuses', async () => {
    const store = fakeStore();
    const adapter = fakeAdapter({ grantsOnRequest: false, days });
    expect(await connectAndSync({ adapter, store, from: 'a', to: 'b' })).toEqual({
      status: 'denied',
    });
    expect(adapter.reads).toBe(0);
    expect(store.rows).toEqual({});
  });

  it('does not prompt when Health Connect is unavailable', async () => {
    const adapter = fakeAdapter({ availability: 'unavailable' });
    expect((await connectAndSync({ adapter, store: fakeStore(), from: 'a', to: 'b' })).status).toBe(
      'unavailable',
    );
    expect(adapter.requests).toBe(0);
  });
});
