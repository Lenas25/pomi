import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ACTIONS, SNOOZE_MINUTES } from './constants';
import {
  applyResponse,
  routeForNotification,
  type ResponseDeps,
  type ResponseInput,
} from './responses';

const NOW = new Date(2026, 9, 5, 20, 10).getTime();

const logActivity = jest.fn<ResponseDeps['logActivity']>();
const incrementHabit = jest.fn<ResponseDeps['incrementHabit']>();
const setHabitDone = jest.fn<ResponseDeps['setHabitDone']>();
const scheduleSnooze = jest.fn<ResponseDeps['scheduleSnooze']>();
const claimed = new Set<string>();
let deps: ResponseDeps;

beforeEach(() => {
  jest.resetAllMocks();
  claimed.clear();
  for (const fn of [logActivity, incrementHabit, setHabitDone, scheduleSnooze]) {
    fn.mockResolvedValue(undefined);
  }
  deps = {
    today: () => '2026-10-05',
    now: () => NOW,
    claim: async (key) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    release: async (key) => {
      claimed.delete(key);
    },
    logActivity,
    incrementHabit,
    setHabitDone,
    scheduleSnooze,
  };
});

function input(actionIdentifier: string, data: Record<string, unknown> = {}): ResponseInput {
  return {
    actionIdentifier,
    notificationId: 'n1',
    deliveredAt: 1000,
    title: 'Agua',
    body: 'Toma un vaso de agua.',
    categoryIdentifier: 'pomi_water',
    data: { source: 'pomi', kind: 'water', channel: 'habits', date: '2026-10-05', ...data },
  };
}

describe('survey actions (work with the app closed)', () => {
  it.each<[string, string]>([
    [ACTIONS.gym, 'gym'],
    [ACTIONS.walk, 'walk'],
    [ACTIONS.none, 'none'],
  ])('%s writes activity_logs kind %s with source notification', async (action, kind) => {
    const outcome = await applyResponse(
      input(action, { kind: 'survey', channel: 'checkins' }),
      deps,
    );
    expect(outcome).toBe('handled');
    expect(logActivity).toHaveBeenCalledWith('2026-10-05', kind);
  });
});

describe('habit actions', () => {
  it('"+1 vaso" increments the water counter of today', async () => {
    await applyResponse(input(ACTIONS.addWater, { habitId: 'agua' }), deps);
    expect(incrementHabit).toHaveBeenCalledWith('agua', '2026-10-05');
  });

  it('"Hecho" marks the check habit as done today', async () => {
    await applyResponse(input(ACTIONS.done, { habitId: 'pausa-activa' }), deps);
    expect(setHabitDone).toHaveBeenCalledWith('pausa-activa', '2026-10-05');
  });

  it('ignores "+1 vaso" / "Hecho" without a habit id', async () => {
    expect(await applyResponse(input(ACTIONS.addWater), deps)).toBe('ignored');
    expect(await applyResponse(input(ACTIONS.done), deps)).toBe('ignored');
    expect(incrementHabit).not.toHaveBeenCalled();
    expect(setHabitDone).not.toHaveBeenCalled();
  });

  it('"Posponer 10 min" schedules the same content again in 10 minutes', async () => {
    await applyResponse(input(ACTIONS.snooze, { habitId: 'agua' }), deps);
    const request = scheduleSnooze.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      at: NOW + SNOOZE_MINUTES * 60_000,
      title: 'Agua',
      body: 'Toma un vaso de agua.',
      channel: 'habits',
      category: 'pomi_water',
    });
    // A snooze id never collides with the planned ones (they are not managed by the diff).
    expect(request?.id.startsWith('snooze:')).toBe(true);
  });
});

describe('safety', () => {
  it('applies a response only once (background task + listener both fire)', async () => {
    const first = await applyResponse(input(ACTIONS.addWater, { habitId: 'agua' }), deps);
    const second = await applyResponse(input(ACTIONS.addWater, { habitId: 'agua' }), deps);
    expect([first, second]).toEqual(['handled', 'duplicate']);
    expect(incrementHabit).toHaveBeenCalledTimes(1);
  });

  it('ignores notifications that are not Pomi planned ones (timers) and unknown actions', async () => {
    expect(await applyResponse({ ...input(ACTIONS.gym), data: {} }, deps)).toBe('ignored');
    expect(await applyResponse(input('something_else'), deps)).toBe('ignored');
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('failure and dates', () => {
  it('gives the claim back when the action fails, so a retry applies it', async () => {
    incrementHabit.mockRejectedValueOnce(new Error('disk full'));
    await expect(applyResponse(input(ACTIONS.addWater, { habitId: 'agua' }), deps)).rejects.toThrow(
      'disk full',
    );
    const retry = await applyResponse(input(ACTIONS.addWater, { habitId: 'agua' }), deps);
    expect(retry).toBe('handled');
    expect(incrementHabit).toHaveBeenCalledTimes(2);
  });

  it('writes to the day the notification was planned for, not the day of the tap', async () => {
    // Tapped on the 7th, planned for the 5th.
    deps = { ...deps, today: () => '2026-10-07' };
    await applyResponse(input(ACTIONS.addWater, { habitId: 'agua', date: '2026-10-05' }), deps);
    await applyResponse(input(ACTIONS.done, { habitId: 'pausa', date: '2026-10-05' }), deps);
    await applyResponse(input(ACTIONS.gym, { date: '2026-10-05' }), deps);
    expect(incrementHabit).toHaveBeenCalledWith('agua', '2026-10-05');
    expect(setHabitDone).toHaveBeenCalledWith('pausa', '2026-10-05');
    expect(logActivity).toHaveBeenCalledWith('2026-10-05', 'gym');
  });

  it('falls back to today when the payload carries no date', async () => {
    const { date: _omit, ...data } = input(ACTIONS.addWater).data as Record<string, unknown>;
    await applyResponse({ ...input(ACTIONS.addWater), data: { ...data, habitId: 'agua' } }, deps);
    expect(incrementHabit).toHaveBeenCalledWith('agua', '2026-10-05');
  });
});

describe('routeForNotification', () => {
  it('opens the matching check-in, otherwise Hoy', () => {
    expect(
      routeForNotification({
        source: 'pomi',
        kind: 'checkin',
        channel: 'checkins',
        checkin: 'night',
      }),
    ).toEqual({ pathname: '/checkin/[tipo]', params: { tipo: 'night' } });
    expect(routeForNotification({ source: 'pomi', kind: 'survey', channel: 'checkins' })).toEqual({
      pathname: '/hoy',
    });
    expect(routeForNotification({})).toBeNull();
  });
});
