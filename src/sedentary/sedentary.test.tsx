import { describe, expect, it, jest } from '@jest/globals';

import { intervalFor } from '../notifications/backgroundPolicy';
import { categoryDefinitions } from '../notifications/categories';
import { ACTIONS } from '../notifications/constants';
import { DEFAULT_SEDENTARY, type NudgeHistory } from '../domain/sedentary';
import { es } from '../i18n/es';
import { en } from '../i18n/en';

import { ensureNudgePermissions } from './enable';
import {
  nudgeNeedsFrequentWorker,
  resolveSedentaryConfig,
  runSedentaryNudge,
  type NudgeDeps,
} from './runNudge';

jest.mock('expo-background-task', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-notifications', () => ({}));
jest.mock('../db', () => ({ getDatabase: jest.fn(), getRepositories: jest.fn() }));
jest.mock('../db/useDatabaseReady', () => ({ bootstrapDatabase: jest.fn() }));
jest.mock('../suggestions/run', () => ({ runDailySuggestions: jest.fn() }));
jest.mock('../notifications/handleResponse', () => ({ handleNotificationResponse: jest.fn() }));
jest.mock('../notifications/sync', () => ({ runNotificationSync: jest.fn() }));
jest.mock('./nudgeTask', () => ({ runSedentaryNudgeForReal: jest.fn() }));

// Tuesday 2026-02-03 11:00; wake 06:00, bed 22:30.
const NOW = new Date(2026, 1, 3, 11, 0);

function setup(overrides: Partial<NudgeDeps> = {}, stored: Partial<typeof DEFAULT_SEDENTARY> = {}) {
  let history: NudgeHistory | undefined;
  const notify = jest.fn<NudgeDeps['notify']>(async () => undefined);
  const readSteps = jest.fn<NudgeDeps['readSteps']>(async () => ({
    steps: 30,
    hasRecentData: true,
  }));
  const saveHistory = jest.fn<NudgeDeps['saveHistory']>(async (next) => {
    history = next;
  });
  const deps: NudgeDeps = {
    now: () => NOW,
    config: async () => resolveSedentaryConfig({ enabled: true, ...stored }),
    hasPermission: async () => true,
    anchors: async () => ({ wakeMin: 360, bedMin: 1350 }),
    history: async () => history,
    saveHistory,
    readSteps,
    notify,
    ...overrides,
  };
  return { deps, notify, readSteps, saveHistory, history: () => history };
}

describe('runSedentaryNudge', () => {
  it('reads Health Connect, notifies once and remembers it (cooldown and cap)', async () => {
    const run = setup();
    expect(await runSedentaryNudge(run.deps)).toEqual({ send: true, reason: 'send' });
    expect(run.readSteps).toHaveBeenCalledWith(90, NOW.getTime());
    expect(run.notify).toHaveBeenCalledTimes(1);
    expect(run.history()).toMatchObject({ date: '2026-02-03', count: 1, lastAt: NOW.getTime() });
    // The very next run (15 minutes later) is inside the cooldown: no second nudge, no read.
    const later = { ...run.deps, now: () => new Date(2026, 1, 3, 11, 15) };
    expect((await runSedentaryNudge(later)).reason).toBe('cooldown');
    expect(run.notify).toHaveBeenCalledTimes(1);
    expect(run.readSteps).toHaveBeenCalledTimes(1);
  });

  it('is off by default: nothing is read, nothing is shown', async () => {
    const run = setup({ config: async () => resolveSedentaryConfig(undefined) });
    expect((await runSedentaryNudge(run.deps)).reason).toBe('disabled');
    expect(run.readSteps).not.toHaveBeenCalled();
    expect(run.notify).not.toHaveBeenCalled();
  });

  it('skips the Health Connect read for every cheap "no"', async () => {
    for (const [overrides, stored, reason] of [
      [{ hasPermission: async () => false }, {}, 'noPermission'],
      [{}, { noPhone: true }, 'noPhone'],
      [{}, { days: [6] }, 'dayNotSelected'],
      [{ now: () => new Date(2026, 1, 3, 22, 0) }, {}, 'quietHours'],
      [{ anchors: async () => ({ wakeMin: undefined, bedMin: undefined }) }, {}, 'noPlan'],
    ] as const) {
      const run = setup(overrides, stored);
      expect((await runSedentaryNudge(run.deps)).reason).toBe(reason);
      expect(run.readSteps).not.toHaveBeenCalled();
      expect(run.notify).not.toHaveBeenCalled();
    }
  });

  it('a failed or empty read is "no data", never inactivity', async () => {
    const failing = setup({
      readSteps: async () => {
        throw new Error('Health Connect is busy');
      },
    });
    expect((await runSedentaryNudge(failing.deps)).reason).toBe('noData');
    const empty = setup({ readSteps: async () => ({ steps: 0, hasRecentData: false }) });
    expect((await runSedentaryNudge(empty.deps)).reason).toBe('noData');
    expect(empty.notify).not.toHaveBeenCalled();
  });

  it('does not nudge someone who moved', async () => {
    const run = setup({ readSteps: async () => ({ steps: 400, hasRecentData: true }) });
    expect((await runSedentaryNudge(run.deps)).reason).toBe('enough');
    expect(run.saveHistory).not.toHaveBeenCalled();
  });

  it('gives the count back when the notification fails, and shows nothing if it cannot be counted', async () => {
    const previous: NudgeHistory = {
      date: '2026-02-03',
      count: 1,
      lastAt: new Date(2026, 1, 3, 7, 30).getTime(),
    };
    const failing = setup({
      history: async () => previous,
      notify: async () => {
        throw new Error('no channel');
      },
    });
    await expect(runSedentaryNudge(failing.deps)).rejects.toThrow('no channel');
    expect(failing.saveHistory).toHaveBeenLastCalledWith(previous);

    // First nudge ever: a failed notification must not leave a count behind either.
    const fresh = setup({
      notify: async () => {
        throw new Error('no channel');
      },
    });
    await expect(runSedentaryNudge(fresh.deps)).rejects.toThrow('no channel');
    expect(fresh.history()?.count).toBe(0);
    expect(fresh.history()?.lastAt).toBeUndefined();

    const unsaved = setup({
      saveHistory: async () => {
        throw new Error('db');
      },
    });
    await expect(runSedentaryNudge(unsaved.deps)).rejects.toThrow('db');
    expect(unsaved.notify).not.toHaveBeenCalled();
  });
});

describe('configuration', () => {
  it('defaults: off, 90 minutes, 100 steps, Monday to Friday, 3 a day', () => {
    expect(resolveSedentaryConfig(undefined)).toEqual({
      enabled: false,
      windowMin: 90,
      threshold: 100,
      days: [1, 2, 3, 4, 5],
      maxPerDay: 3,
      noPhone: false,
    });
  });

  it('the background job runs every 15 minutes only while the nudge can fire', () => {
    expect(nudgeNeedsFrequentWorker(undefined)).toBe(false);
    expect(nudgeNeedsFrequentWorker({ enabled: true })).toBe(true);
    expect(nudgeNeedsFrequentWorker({ enabled: true, noPhone: true })).toBe(false);
    expect(intervalFor({ enabled: true }, true)).toBe(15);
    expect(intervalFor({ enabled: true }, false)).toBe(360);
    expect(intervalFor(undefined, true)).toBe(360);
  });
});

describe('ensureNudgePermissions', () => {
  const adapter = (overrides: Partial<Parameters<typeof ensureNudgePermissions>[0]> = {}) => ({
    getAvailability: async () => 'available' as const,
    hasPermission: async () => true,
    requestPermission: jest.fn(async () => true),
    hasBackgroundPermission: async () => true,
    requestBackgroundPermission: jest.fn(async () => true),
    ...overrides,
  });

  it('asks only for what is missing', async () => {
    const granted = adapter();
    expect(await ensureNudgePermissions(granted)).toBe('granted');
    expect(granted.requestPermission).not.toHaveBeenCalled();
    expect(granted.requestBackgroundPermission).not.toHaveBeenCalled();

    const missing = adapter({ hasBackgroundPermission: async () => false });
    expect(await ensureNudgePermissions(missing)).toBe('granted');
    expect(missing.requestBackgroundPermission).toHaveBeenCalledTimes(1);
  });

  it('stays off when Health Connect is missing or a permission is refused', async () => {
    expect(
      await ensureNudgePermissions(adapter({ getAvailability: async () => 'unavailable' })),
    ).toBe('unavailable');
    expect(
      await ensureNudgePermissions(
        adapter({
          hasPermission: async () => false,
          requestPermission: jest.fn(async () => false),
        }),
      ),
    ).toBe('denied');
    expect(
      await ensureNudgePermissions(
        adapter({
          hasBackgroundPermission: async () => false,
          requestBackgroundPermission: jest.fn(async () => false),
        }),
      ),
    ).toBe('bgDenied');
    expect(
      await ensureNudgePermissions(
        adapter({
          hasBackgroundPermission: async () => false,
          requestBackgroundPermission: jest.fn(async () => {
            throw new Error('feature missing');
          }),
        }),
      ),
    ).toBe('featureUnavailable');
    expect(
      await ensureNudgePermissions(
        adapter({
          getAvailability: async () => {
            throw new Error('boom');
          },
        }),
      ),
    ).toBe('denied');
  });
});

describe('texts and category', () => {
  it('the notification fits the BRAND limits (title 30, body 80) and the category has only "Hecho"', () => {
    for (const messages of [es, en]) {
      expect(messages.sedentary.notification.title.length).toBeLessThanOrEqual(30);
      expect(messages.sedentary.notification.body.length).toBeLessThanOrEqual(80);
      expect(messages.sedentary.notification.body).not.toMatch(/racha|streak|deber/i);
    }
    const definitions = categoryDefinitions(((key: string) => key) as never);
    expect(definitions.pomi_pause.map((action) => action.identifier)).toEqual([ACTIONS.done]);
  });
});
