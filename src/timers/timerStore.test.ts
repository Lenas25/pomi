import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createTimerStore, type TimerEffects, type TimerStore } from './timerStore';

const notification = { title: 'Rest over', body: 'Next: set 2' };
let clock = 1_000_000;
let nextId = 0;
let scheduled: { id: string; endsAt: number }[] = [];
let cancelled: string[] = [];
let store: TimerStore;
let effects: TimerEffects;

/** Lets the fire-and-forget scheduling promises settle. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  clock = 1_000_000;
  nextId = 0;
  scheduled = [];
  cancelled = [];
  effects = {
    schedule: jest.fn(async (endsAt: number) => {
      nextId += 1;
      const id = `n${nextId}`;
      scheduled.push({ id, endsAt });
      return id;
    }),
    cancel: jest.fn(async (id: string) => {
      cancelled.push(id);
    }),
  };
  store = createTimerStore(effects, () => clock);
});

function start(owner = 'rest:ht:0', durationSec = 120) {
  store.getState().start({ owner, kind: 'rest', durationSec, notification, nextLabel: 'Set 2' });
}

describe('timer store notifications', () => {
  it('schedules ONE notification at the end timestamp when a timer starts', async () => {
    start();
    await flush();
    expect(scheduled).toEqual([{ id: 'n1', endsAt: clock + 120_000 }]);
    expect(store.getState().active?.notificationId).toBe('n1');
  });

  it('cancels it on pause and schedules a new one with the remaining time on resume', async () => {
    start();
    await flush();
    clock += 45_000;
    store.getState().pause();
    await flush();
    expect(cancelled).toEqual(['n1']);
    expect(store.getState().active?.state).toMatchObject({ status: 'paused', remainingMs: 75_000 });
    expect(store.getState().active?.notificationId).toBeNull();

    clock += 600_000;
    store.getState().resume();
    await flush();
    expect(scheduled.at(-1)).toEqual({ id: 'n2', endsAt: clock + 75_000 });
  });

  it('reschedules on +30 s', async () => {
    start();
    await flush();
    store.getState().addTime(30);
    await flush();
    expect(cancelled).toEqual(['n1']);
    expect(scheduled.at(-1)?.endsAt).toBe(clock + 150_000);
  });

  it('cancels on skip and marks it as skipped', async () => {
    start();
    await flush();
    store.getState().skip();
    await flush();
    expect(cancelled).toEqual(['n1']);
    expect(store.getState().active).toMatchObject({
      finishedBy: 'skipped',
      state: { status: 'finished' },
    });
  });

  it('cancel(owner) only affects the timer of that owner (✓ undone cancels its own rest)', async () => {
    start('rest:ht:0');
    await flush();
    store.getState().cancel('rest:ht:1');
    expect(store.getState().active?.owner).toBe('rest:ht:0');
    expect(cancelled).toEqual([]);
    store.getState().cancel('rest:ht:0');
    await flush();
    expect(store.getState().active).toBeNull();
    expect(cancelled).toEqual(['n1']);
  });

  it('replaces the previous timer (and its notification) when another starts', async () => {
    start('rest:ht:0');
    await flush();
    start('rest:ht:1');
    await flush();
    expect(cancelled).toEqual(['n1']);
    expect(store.getState().active?.notificationId).toBe('n2');
  });

  it('drops a notification that finished scheduling after the timer changed', async () => {
    let resolveSchedule: (id: string) => void = () => undefined;
    (effects.schedule as jest.Mock<TimerEffects['schedule']>).mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveSchedule = resolve)),
    );
    start();
    store.getState().cancel();
    resolveSchedule('late');
    await flush();
    expect(cancelled).toEqual(['late']);
    expect(store.getState().active).toBeNull();
  });

  it('tolerates scheduling that is not possible (no permission)', async () => {
    (effects.schedule as jest.Mock<TimerEffects['schedule']>).mockResolvedValueOnce(null);
    start();
    await flush();
    expect(store.getState().active?.notificationId).toBeNull();
    expect(store.getState().active?.state.status).toBe('running');
  });
});

describe('timer store revisions and lapsed timers', () => {
  it('never reuses a revision, even for the same owner after cancel + start', () => {
    start('rest:ht:0');
    const first = store.getState().active?.revision ?? 0;
    store.getState().cancel();
    start('rest:ht:0');
    const second = store.getState().active?.revision ?? 0;
    store.getState().pause();
    const third = store.getState().active?.revision ?? 0;
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('a stale scheduling result of a cancelled run cannot attach to a new run of the same owner', async () => {
    let resolveFirst: (id: string) => void = () => undefined;
    (effects.schedule as jest.Mock<TimerEffects['schedule']>).mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveFirst = resolve)),
    );
    start('rest:ht:0');
    store.getState().cancel();
    start('rest:ht:0');
    await flush();
    resolveFirst('stale');
    await flush();
    expect(cancelled).toContain('stale');
    expect(store.getState().active?.notificationId).toBe('n1');
  });

  it('pausing a timer that already ran out finishes it as elapsed (alarm path)', async () => {
    start('rest:ht:0', 60);
    await flush();
    clock += 120_000;
    store.getState().pause();
    expect(store.getState().active).toMatchObject({
      finishedBy: 'elapsed',
      state: { status: 'finished' },
    });
    expect(store.getState().active?.finishedAt).toBe(1_000_000 + 60_000);
  });

  it('+30 s on a lapsed timer finishes it as elapsed instead of reviving it', async () => {
    start('rest:ht:0', 60);
    await flush();
    clock += 120_000;
    store.getState().addTime(30);
    expect(store.getState().active).toMatchObject({
      finishedBy: 'elapsed',
      state: { status: 'finished' },
    });
  });

  it('records when the run began and keeps it across pause / resume / +30 s', () => {
    start('rest:ht:0');
    const startedAt = store.getState().active?.startedAt;
    expect(startedAt).toBe(clock);
    clock += 10_000;
    store.getState().pause();
    store.getState().resume();
    store.getState().addTime(30);
    expect(store.getState().active?.startedAt).toBe(startedAt);
  });
});

describe('timer store clock sync', () => {
  it('finishes when the end passed (also after being in the background)', async () => {
    start('rest:ht:0', 60);
    await flush();
    clock += 30_000;
    store.getState().sync();
    expect(store.getState().active?.state.status).toBe('running');

    clock += 600_000;
    store.getState().sync();
    const active = store.getState().active;
    expect(active).toMatchObject({ finishedBy: 'elapsed', state: { status: 'finished' } });
    expect(active?.finishedAt).toBe(1_000_000 + 60_000);
    expect(cancelled).toEqual(['n1']);
  });

  it('dismiss only hides a finished timer', async () => {
    start();
    store.getState().dismiss();
    expect(store.getState().active).not.toBeNull();
    store.getState().skip();
    store.getState().dismiss();
    expect(store.getState().active).toBeNull();
  });
});
