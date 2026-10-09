import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ACTIONS } from './constants';
import type { ResponseDeps } from './responses';
import {
  DEFAULT_ACTION,
  parseResponsePayload,
  processNotificationResponse,
  type ResponseEnv,
} from './responsePayload';

const payload = {
  source: 'pomi',
  kind: 'water',
  channel: 'habits',
  habitId: 'agua',
  date: '2026-10-05',
};

/** What `addNotificationResponseReceivedListener` gets (JS mapper already parsed the data). */
function mappedResponse(actionIdentifier: string) {
  return {
    actionIdentifier,
    notification: {
      date: 1000,
      request: {
        identifier: 'water:core:agua:2026-10-05:11:00',
        trigger: { type: 'date', value: 1000, channelId: 'habits' },
        content: {
          title: 'Agua',
          body: 'Un vaso.',
          categoryIdentifier: 'pomi_water',
          data: payload,
          dataString: JSON.stringify(payload),
        },
      },
    },
  };
}

/** What the background task gets: the raw native bundle, payload ONLY as `dataString`. */
function rawTaskBundle(actionIdentifier: string) {
  const response = mappedResponse(actionIdentifier);
  const { data: _data, ...content } = response.notification.request.content;
  return {
    ...response,
    notification: {
      ...response.notification,
      request: { ...response.notification.request, content },
    },
  };
}

describe('parseResponsePayload', () => {
  it('reads the listener shape', () => {
    expect(parseResponsePayload(mappedResponse(ACTIONS.addWater))).toEqual({
      actionIdentifier: ACTIONS.addWater,
      notificationId: 'water:core:agua:2026-10-05:11:00',
      deliveredAt: 1000,
      title: 'Agua',
      body: 'Un vaso.',
      categoryIdentifier: 'pomi_water',
      data: payload,
    });
  });

  it('reads the raw task bundle (dataString only) the same way', () => {
    expect(parseResponsePayload(rawTaskBundle(ACTIONS.addWater))).toEqual(
      parseResponsePayload(mappedResponse(ACTIONS.addWater)),
    );
  });

  it('unwraps a response nested once under `notification`', () => {
    expect(parseResponsePayload({ notification: rawTaskBundle(ACTIONS.snooze) })?.data).toEqual(
      payload,
    );
  });

  it('rejects things that are not a response and survives broken JSON', () => {
    expect(parseResponsePayload(undefined)).toBeNull();
    expect(parseResponsePayload({ data: { dataString: '{}' } })).toBeNull();
    const broken = rawTaskBundle(ACTIONS.done);
    broken.notification.request.content.dataString = '{oops';
    expect(parseResponsePayload(broken)?.data).toBeUndefined();
  });
});

describe('processNotificationResponse', () => {
  const claimed = new Set<string>();
  const incrementHabit = jest.fn<ResponseDeps['incrementHabit']>();
  const scheduleSnooze = jest.fn<ResponseDeps['scheduleSnooze']>();
  const dismiss = jest.fn<ResponseEnv['dismiss']>();
  const sync = jest.fn<ResponseEnv['sync']>();
  const order: string[] = [];
  let env: ResponseEnv;

  beforeEach(() => {
    jest.resetAllMocks();
    claimed.clear();
    order.length = 0;
    incrementHabit.mockImplementation(async () => {
      order.push('write');
    });
    scheduleSnooze.mockImplementation(async () => {
      order.push('snooze');
    });
    dismiss.mockImplementation(async () => {
      order.push('dismiss');
    });
    sync.mockResolvedValue(undefined);
    const deps: ResponseDeps = {
      today: () => '2026-10-05',
      now: () => 5000,
      claim: async (key) => {
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
      release: async (key) => {
        claimed.delete(key);
      },
      logActivity: async () => undefined,
      incrementHabit,
      setHabitDone: async () => undefined,
      scheduleSnooze,
    };
    env = {
      bootstrap: async () => {
        order.push('bootstrap');
      },
      deps: () => deps,
      dismiss,
      sync,
      log: () => undefined,
    };
  });

  it('background task: bootstraps the DB, writes, dismisses, then syncs', async () => {
    await expect(processNotificationResponse(rawTaskBundle(ACTIONS.addWater), env)).resolves.toBe(
      'handled',
    );
    expect(incrementHabit).toHaveBeenCalledWith('agua', '2026-10-05');
    expect(dismiss).toHaveBeenCalledWith('water:core:agua:2026-10-05:11:00');
    expect(order).toEqual(['bootstrap', 'write', 'dismiss']);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('foreground listener path works and dedupes against the task', async () => {
    await processNotificationResponse(rawTaskBundle(ACTIONS.addWater), env);
    await expect(processNotificationResponse(mappedResponse(ACTIONS.addWater), env)).resolves.toBe(
      'duplicate',
    );
    expect(incrementHabit).toHaveBeenCalledTimes(1);
    // The duplicate still clears the shade (idempotent).
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('snooze schedules the copy AND dismisses the current one, without a sync', async () => {
    await processNotificationResponse(rawTaskBundle(ACTIONS.snooze), env);
    expect(scheduleSnooze).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'snooze:water:core:agua:2026-10-05:11:00:605000',
        at: 605000,
        data: payload,
      }),
    );
    expect(order).toEqual(['bootstrap', 'snooze', 'dismiss']);
    expect(sync).not.toHaveBeenCalled();
  });

  it('a plain tap is left to navigation: no DB, no dismiss', async () => {
    await expect(processNotificationResponse(mappedResponse(DEFAULT_ACTION), env)).resolves.toBe(
      'ignored',
    );
    expect(order).toEqual([]);
  });

  it('a failed write keeps the notification and releases the claim', async () => {
    incrementHabit.mockRejectedValueOnce(new Error('disk'));
    await expect(processNotificationResponse(rawTaskBundle(ACTIONS.addWater), env)).rejects.toThrow(
      'disk',
    );
    expect(dismiss).not.toHaveBeenCalled();
    await expect(processNotificationResponse(rawTaskBundle(ACTIONS.addWater), env)).resolves.toBe(
      'handled',
    );
  });

  it('a dismiss failure does not fail the action', async () => {
    dismiss.mockRejectedValueOnce(new Error('gone'));
    await expect(processNotificationResponse(rawTaskBundle(ACTIONS.addWater), env)).resolves.toBe(
      'handled',
    );
  });
});
