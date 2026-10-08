import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { Translate } from '../i18n';

import { createKeyedQueue } from './asyncControl';
import type { SetsStep } from './sessionViewModel';
import {
  createSetActions,
  holdOwner,
  nextLabelFor,
  restOwner,
  type SetActionsDeps,
} from './setActions';

const t: Translate = (key, options) => (options ? `${key}|${JSON.stringify(options)}` : key);

const squat: SetsStep = {
  type: 'sets',
  id: 'squat',
  name: 'Squat',
  sets: 3,
  reps: '8–10',
  restSec: 120,
};
const curl: SetsStep = {
  type: 'sets',
  id: 'curl',
  name: 'Curl',
  sets: 2,
  reps: '10–12',
  restSec: 0,
};
const plank: SetsStep = {
  type: 'sets',
  id: 'plank',
  name: 'Plank',
  sets: 2,
  reps: '1',
  restSec: 30,
  holdSec: 40,
  bodyweight: true,
};

let sessionId: number | null;
let deps: SetActionsDeps;
const logSet = jest.fn<SetActionsDeps['workouts']['logSet']>();
const unlogSet = jest.fn<SetActionsDeps['workouts']['unlogSet']>();
const updateRir = jest.fn<SetActionsDeps['workouts']['updateRir']>();
const start = jest.fn<SetActionsDeps['timers']['start']>();
const cancel = jest.fn<SetActionsDeps['timers']['cancel']>();
const haptic = jest.fn<() => void>();

beforeEach(() => {
  jest.resetAllMocks();
  logSet.mockResolvedValue(undefined);
  unlogSet.mockResolvedValue(undefined);
  updateRir.mockResolvedValue(undefined);
  sessionId = null;
  deps = {
    ensureSession: async () => {
      sessionId ??= 7;
      return sessionId;
    },
    currentSessionId: () => sessionId,
    workouts: { logSet, unlogSet, updateRir },
    timers: { start, cancel },
    now: () => 5000,
    t,
    haptic,
  };
});

describe('nextLabelFor', () => {
  const steps = [squat, curl];
  it('points at the next set of the same exercise, then the next exercise, then nothing', () => {
    expect(nextLabelFor(steps, 0, 0, t)).toContain('timers.nextSet');
    expect(nextLabelFor(steps, 0, 0, t)).toContain('"n":2');
    expect(nextLabelFor(steps, 0, 2, t)).toContain('Curl');
    expect(nextLabelFor(steps, 1, 1, t)).toBeNull();
  });
});

describe('createSetActions', () => {
  it('✓: haptic, rest timer for that set, creates the session and logs the set', async () => {
    const actions = createSetActions(deps);
    const stored = await actions.markDone(squat, 1, { weightKg: 40, reps: 9, rir: 2 }, 'Next');

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: restOwner('squat', 1),
        kind: 'rest',
        durationSec: 120,
        nextLabel: 'Next',
      }),
    );
    expect(logSet).toHaveBeenCalledWith({
      sessionId: 7,
      stepId: 'squat',
      setIndex: 1,
      weightKg: 40,
      reps: 9,
      rir: 2,
      doneAt: 5000,
    });
    expect(stored).toEqual({ stepId: 'squat', setIndex: 1, weightKg: 40, reps: 9, rir: 2 });
  });

  it('does not start a timer for an exercise without rest', async () => {
    await createSetActions(deps).markDone(curl, 0, { weightKg: 10, reps: 12, rir: null }, null);
    expect(start).not.toHaveBeenCalled();
    expect(logSet).toHaveBeenCalled();
  });

  it('✓ again: unlogs the set and cancels THAT rest', async () => {
    const actions = createSetActions(deps);
    await actions.markDone(squat, 0, { weightKg: 40, reps: 9, rir: null }, null);
    await actions.markUndone(squat, 0);
    expect(cancel).toHaveBeenCalledWith(restOwner('squat', 0));
    expect(unlogSet).toHaveBeenCalledWith(7, 'squat', 0);
  });

  it('unlogging before any session exists only cancels the timer', async () => {
    await createSetActions(deps).markUndone(squat, 0);
    expect(cancel).toHaveBeenCalledWith(restOwner('squat', 0));
    expect(unlogSet).not.toHaveBeenCalled();
  });

  it('cancels the timer and rethrows when the write fails', async () => {
    logSet.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      createSetActions(deps).markDone(squat, 0, { weightKg: 40, reps: 9, rir: null }, null),
    ).rejects.toThrow('disk full');
    expect(cancel).toHaveBeenCalledWith(restOwner('squat', 0));
  });

  it('updates ONLY the RIR of a logged set (no rewrite of numbers or doneAt)', async () => {
    sessionId = 7;
    await createSetActions(deps).updateRir(squat, 2, 2);
    expect(updateRir).toHaveBeenCalledWith(7, 'squat', 2, 2);
    expect(logSet).not.toHaveBeenCalled();
  });

  it('serializes ✓ then un-✓ on the same set through the keyed queue (no ghost set)', async () => {
    const queue = createKeyedQueue();
    const log: string[] = [];
    let releaseWrite!: () => void;
    logSet.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      log.push('logged');
    });
    unlogSet.mockImplementation(async () => {
      log.push('unlogged');
    });
    const actions = createSetActions(deps);
    const key = `${squat.id}:0`;
    const done = queue.run(key, () =>
      actions.markDone(squat, 0, { weightKg: 40, reps: 9, rir: null }, null),
    );
    const undone = queue.run(key, () => actions.markUndone(squat, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unlogSet).not.toHaveBeenCalled();
    releaseWrite();
    await Promise.all([done, undone]);
    expect(log).toEqual(['logged', 'unlogged']);
  });

  it('starts a hold timer for holdSec exercises only', () => {
    const actions = createSetActions(deps);
    actions.startHold(plank, 0);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ owner: holdOwner('plank', 0), kind: 'wait', durationSec: 40 }),
    );
    start.mockClear();
    actions.startHold(squat, 0);
    expect(start).not.toHaveBeenCalled();
  });
});
