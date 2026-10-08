import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { createHealthConnectAdapter } from './healthConnect';

const mockLib = {
  SdkAvailabilityStatus: {
    SDK_UNAVAILABLE: 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
    SDK_AVAILABLE: 3,
  },
  getSdkStatus: jest.fn<() => Promise<number>>(),
  initialize: jest.fn<() => Promise<boolean>>(),
  getGrantedPermissions: jest.fn<() => Promise<{ accessType: string; recordType: string }[]>>(),
  requestPermission: jest.fn<() => Promise<{ accessType: string; recordType: string }[]>>(),
  aggregateGroupByPeriod: jest.fn<(request: unknown) => Promise<unknown[]>>(),
  openHealthConnectSettings: jest.fn(),
};

jest.mock('react-native-health-connect', () => ({
  get SdkAvailabilityStatus() {
    return mockLib.SdkAvailabilityStatus;
  },
  getSdkStatus: () => mockLib.getSdkStatus(),
  initialize: () => mockLib.initialize(),
  getGrantedPermissions: () => mockLib.getGrantedPermissions(),
  requestPermission: () => mockLib.requestPermission(),
  aggregateGroupByPeriod: (request: unknown) => mockLib.aggregateGroupByPeriod(request),
  openHealthConnectSettings: () => mockLib.openHealthConnectSettings(),
}));

beforeEach(() => {
  Platform.OS = 'android';
  jest.clearAllMocks();
  mockLib.initialize.mockResolvedValue(true);
});

describe('Health Connect adapter', () => {
  it('maps the SDK status to availability, and is unavailable off Android', async () => {
    const adapter = createHealthConnectAdapter();
    mockLib.getSdkStatus.mockResolvedValue(3);
    expect(await adapter.getAvailability()).toBe('available');
    mockLib.getSdkStatus.mockResolvedValue(2);
    expect(await adapter.getAvailability()).toBe('update_required');
    mockLib.getSdkStatus.mockResolvedValue(1);
    expect(await adapter.getAvailability()).toBe('unavailable');
    Platform.OS = 'ios';
    expect(await adapter.getAvailability()).toBe('unavailable');
  });

  it('only treats a granted READ of Steps as the permission', async () => {
    const adapter = createHealthConnectAdapter();
    mockLib.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Heart' }]);
    expect(await adapter.hasPermission()).toBe(false);
    mockLib.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    expect(await adapter.hasPermission()).toBe(true);

    mockLib.requestPermission.mockResolvedValue([]);
    expect(await adapter.requestPermission()).toBe(false);
    mockLib.requestPermission.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    expect(await adapter.requestPermission()).toBe(true);
  });

  it('reads one aggregated slice per logical day and zero-fills missing slices', async () => {
    const adapter = createHealthConnectAdapter();
    mockLib.aggregateGroupByPeriod.mockResolvedValue([
      { startTime: '2026-10-05T04:00', result: { COUNT_TOTAL: 4200 } },
      { startTime: '2026-10-06T04:00', result: { COUNT_TOTAL: 8000 } },
    ]);
    const days = await adapter.readDailySteps('2026-10-05', '2026-10-07');
    expect(days).toEqual([
      { date: '2026-10-05', steps: 4200 },
      { date: '2026-10-06', steps: 8000 },
      { date: '2026-10-07', steps: 0 },
    ]);
    // The window opens at 04:00 local of the first day (the logical-day rollover), not at midnight.
    expect(mockLib.aggregateGroupByPeriod.mock.calls[0]?.[0]).toMatchObject({
      recordType: 'Steps',
      timeRangeSlicer: { period: 'DAYS', length: 1 },
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(2026, 9, 5, 4, 0).toISOString(),
      },
    });
  });

  it('maps slices by their local start date, not by position (omitted and reordered slices)', async () => {
    const adapter = createHealthConnectAdapter();
    mockLib.aggregateGroupByPeriod.mockResolvedValue([
      { startTime: '2026-10-07T04:00', result: { COUNT_TOTAL: 900 } },
      { startTime: '2026-10-05T04:00:30', result: { COUNT_TOTAL: 4200 } },
      { startTime: 'not a date', result: { COUNT_TOTAL: 1 } },
    ]);
    expect(await adapter.readDailySteps('2026-10-05', '2026-10-07')).toEqual([
      { date: '2026-10-05', steps: 4200 },
      { date: '2026-10-06', steps: 0 },
      { date: '2026-10-07', steps: 900 },
    ]);
  });

  it('fails (instead of reading) when the client cannot be initialized, and retries later', async () => {
    // `initialize()` is memoized per module instance, so use a fresh one for this scenario.
    let adapter: ReturnType<typeof createHealthConnectAdapter> | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('./healthConnect') as typeof import('./healthConnect');
      adapter = fresh.createHealthConnectAdapter();
    });
    mockLib.initialize.mockResolvedValueOnce(false);
    mockLib.getGrantedPermissions.mockResolvedValue([]);
    await expect(adapter?.hasPermission()).rejects.toThrow('could not be initialized');
    await expect(adapter?.hasPermission()).resolves.toBe(false);
  });
});
