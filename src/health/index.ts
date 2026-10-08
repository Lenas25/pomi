import { Platform } from 'react-native';

import { createHealthConnectAdapter } from './healthConnect';
import { createManualAdapter } from './manual';
import type { HealthAdapter } from './types';

export type { DailySteps, HealthAdapter, HealthAvailability, StepsSourceId } from './types';
export { connectAndSync, syncSteps, type SyncOutcome } from './sync';

let adapter: HealthAdapter | undefined;

/** Health Connect on Android, the manual (no-op) source everywhere else. */
export function getHealthAdapter(): HealthAdapter {
  adapter ??= Platform.OS === 'android' ? createHealthConnectAdapter() : createManualAdapter();
  return adapter;
}
