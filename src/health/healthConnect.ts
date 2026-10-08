import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { Platform } from 'react-native';
import * as lib from 'react-native-health-connect';

import type { DailySteps, HealthAdapter, HealthAvailability } from './types';

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

const STEPS_READ = { accessType: 'read', recordType: 'Steps' } as const;

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
      const first = startOfDay(parseISO(from));
      const dayCount =
        Math.round((startOfDay(parseISO(to)).getTime() - first.getTime()) / 86_400_000) + 1;
      if (dayCount < 1) return [];
      // The filter is converted to the device time zone natively, so local midnights slice local days.
      const end = addDays(first, dayCount);
      const slices = await lib.aggregateGroupByPeriod({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: first.toISOString(),
          endTime: new Date(Math.min(end.getTime(), Date.now())).toISOString(),
        },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });
      return Array.from({ length: dayCount }, (_unused, index) => ({
        date: format(addDays(first, index), 'yyyy-MM-dd'),
        steps: slices[index]?.result.COUNT_TOTAL ?? 0,
      }));
    },

    openSettings(): void {
      lib.openHealthConnectSettings();
    },
  };
}
