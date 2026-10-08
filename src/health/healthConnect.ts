import { Platform } from 'react-native';
import * as lib from 'react-native-health-connect';

import type { DailySteps, HealthAdapter, HealthAvailability, RecentSteps } from './types';
import { stepsWindow } from './window';

// Importing the library is safe on every platform: off Android its native module is a proxy that
// only throws when used, and `getAvailability` checks the platform first.
let initialized: Promise<boolean> | undefined;

/** `initialize()` must run once before any other call. A failure is not cached. */
async function ready(): Promise<void> {
  initialized ??= lib.initialize().catch((error: unknown) => {
    initialized = undefined;
    throw error;
  });
  if (!(await initialized)) {
    initialized = undefined;
    throw new Error('Health Connect could not be initialized');
  }
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}/;

const STEPS_READ = { accessType: 'read', recordType: 'Steps' } as const;
const BACKGROUND_READ = { accessType: 'read', recordType: 'BackgroundAccessPermission' } as const;
/** Slice of the sedentary reading: the aggregate by interval is approximate at this granularity. */
const SLICE_MINUTES = 15;
/** Step records from this long ago prove the step source is delivering data. */
const DATA_LOOKBACK_MS = 6 * 60 * 60_000;

/**
 * Health Connect (react-native-health-connect >= 4, Expo config plugin built in). Steps come from
 * `aggregateGroupByPeriod`, which de-duplicates overlapping sources (phone + watch) the way
 * Health Connect itself does; summing raw `readRecords` would double count.
 */
export function createHealthConnectAdapter(): HealthAdapter {
  return {
    id: 'health_connect',

    async getAvailability(): Promise<HealthAvailability> {
      if (Platform.OS !== 'android') return 'unavailable';
      const status = await lib.getSdkStatus();
      if (status === lib.SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
      return status === lib.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
        ? 'update_required'
        : 'unavailable';
    },

    async hasPermission(): Promise<boolean> {
      await ready();
      const granted = await lib.getGrantedPermissions();
      return granted.some(
        (permission) => permission.accessType === 'read' && permission.recordType === 'Steps',
      );
    },

    async requestPermission(): Promise<boolean> {
      await ready();
      const granted = await lib.requestPermission([STEPS_READ]);
      return granted.some(
        (permission) => permission.accessType === 'read' && permission.recordType === 'Steps',
      );
    },

    async readDailySteps(from: string, to: string): Promise<DailySteps[]> {
      await ready();
      const window = stepsWindow(from, to);
      if (!window) return [];
      // A day is the logical one (04:00 -> 03:59, same as `dayKeyFor`), so the filter starts at
      // 04:00 of the first day and the one-day slices follow it. The filter is converted to the
      // device time zone natively, so these are local wall-clock times.
      const slices = await lib.aggregateGroupByPeriod({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: window.start.toISOString(),
          endTime: new Date(Math.min(window.end.getTime(), Date.now())).toISOString(),
        },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });
      // Slices are matched to days by their local start (`LocalDateTime.toString()`, e.g.
      // `2026-10-05T04:00` = the logical day 2026-10-05), never by position: the library may omit
      // or reorder slices.
      const byDate = new Map<string, number>();
      for (const slice of slices) {
        const date = LOCAL_DATE.exec(slice.startTime)?.[0];
        if (date === undefined) continue;
        byDate.set(date, Math.max(byDate.get(date) ?? 0, slice.result.COUNT_TOTAL ?? 0));
      }
      return window.dates.map((date) => ({ date, steps: byDate.get(date) ?? 0 }));
    },

    async hasBackgroundPermission(): Promise<boolean> {
      await ready();
      const granted = await lib.getGrantedPermissions();
      return granted.some(
        (permission) =>
          permission.accessType === 'read' &&
          permission.recordType === 'BackgroundAccessPermission',
      );
    },

    async requestBackgroundPermission(): Promise<boolean> {
      await ready();
      const granted = await lib.requestPermission([BACKGROUND_READ]);
      return granted.some(
        (permission) =>
          permission.accessType === 'read' &&
          permission.recordType === 'BackgroundAccessPermission',
      );
    },

    async readRecentSteps(windowMin: number, nowMs: number): Promise<RecentSteps> {
      await ready();
      const end = new Date(nowMs).toISOString();
      // Steps per 15-minute slice; summed, the slices give the window total.
      const slices = await lib.aggregateGroupByDuration({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: new Date(nowMs - windowMin * 60_000).toISOString(),
          endTime: end,
        },
        timeRangeSlicer: { duration: 'MINUTES', length: SLICE_MINUTES },
      });
      const steps = slices.reduce((sum, slice) => sum + (slice.result.COUNT_TOTAL ?? 0), 0);
      // Did the step source report anything lately? Without it a zero says nothing.
      const recent = await lib.readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: new Date(nowMs - DATA_LOOKBACK_MS).toISOString(),
          endTime: end,
        },
        pageSize: 1,
      });
      return { steps: Math.round(steps), hasRecentData: recent.records.length > 0 };
    },

    openSettings(): void {
      lib.openHealthConnectSettings();
    },
  };
}
